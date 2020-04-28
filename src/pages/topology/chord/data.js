/*
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
*/

import { MIN_CHORD_THRESHOLD } from "./matrix.js";

const SAMPLES = 5; // number of snapshots to use for rate calculations

class ChordData {
  // eslint-disable-line no-unused-vars
  constructor(QDRService, isRate, converter) {
    this.QDRService = QDRService;
    this.last_matrix = undefined;
    this.last_values = { values: undefined, timestamp: undefined };
    this.rateValues = undefined;
    this.snapshots = []; // last N values used for calculating rate
    this.isRate = isRate;
    // fn to convert raw data to matrix
    this.converter = converter;
    // object that determines which addresses are excluded
    this.filter = [];
  }
  setRate(isRate) {
    this.isRate = isRate;
  }
  setConverter(converter) {
    this.converter = converter;
  }
  setFilter(filter) {
    this.filter = filter;
  }
  getAddresses() {
    let addresses = {};
    let outer = this.snapshots;
    if (outer.length === 0) outer = outer = [this.last_values];
    outer.forEach(function(snap) {
      snap.values.forEach(function(lv) {
        if (!(lv.address in addresses)) {
          addresses[lv.address] = this.filter.indexOf(lv.address) < 0;
        }
      }, this);
    }, this);
    return addresses;
  }
  getRouters() {
    let routers = {};
    let outer = this.snapshots;
    if (outer.length === 0) outer = [this.last_values];
    outer.forEach(function(snap) {
      snap.values.forEach(function(lv) {
        routers[lv.egress] = true;
        routers[lv.ingress] = true;
      });
    });
    return Object.keys(routers).sort();
  }
  applyFilter(filter) {
    if (filter) this.setFilter(filter);
    return new Promise(function(resolve) {
      resolve(convert(this, this.last_values));
    });
  }
  // construct a square matrix of the number of messages each router has egressed from each router
  getMatrix(d, stat) {
    let self = this;
    return new Promise(function(resolve, reject) {
      // get the router.node and router.link info
      // the raw data received from the routers
      // for each router in the network
      const values = self.QDRService.adapter.matrix(d, stat);
      // values is an array of objects like [{ingress: 'xxx', egress: 'xxx', address: 'xxx', messages: ###}, ....]
      // convert the raw values array into a matrix object
      let matrix = convert(self, values);
      // resolve the promise
      resolve(matrix);
    });
  }
  getSiteMatrixForSite(d, converter, stat) {
    let self = this;
    return new Promise((resolve) => {
      const values = self.QDRService.adapter.siteMatrixForSite(d, stat);
      const matrix = convert(self, values, converter);
      resolve(matrix);
    });
  }

  getAllServiceMatrix(converter) {
    let self = this;
    return new Promise((resolve) => {
      const values = self.QDRService.adapter.allServiceMatrix();
      const matrix = convert(self, values, converter);
      resolve(matrix);
    });
  }

  getSiteMatrix(converter, stat) {
    let self = this;
    return new Promise((resolve) => {
      const values = self.QDRService.adapter.siteMatrix(stat);
      const matrix = convert(self, values, converter);
      resolve(matrix);
    });
  }

  getDeploymentMatrix(d, converter, deploymentLinks) {
    let self = this;
    return new Promise((resolve) => {
      const values = [];
      deploymentLinks.forEach((link) => {
        if (link.source === d || link.target === d) {
          values.push({
            ingress: `${link.source.parentNode.site_name}:${link.source.address}`,
            egress: `${link.target.parentNode.site_name}:${link.target.address}`,
            address: d.address,
            info: {
              source: {
                site_name: link.source.parentNode.site_name,
                site_id: link.source.parentNode.site_id,
                address: link.source.address,
              },
              target: {
                site_name: link.target.parentNode.site_name,
                site_id: link.target.parentNode.site_id,
                address: link.target.address,
              },
            },
            messages: link.value,
          });
        }
      });
      const matrix = convert(self, values, converter);
      resolve(matrix);
    });
  }

  getAllDeploymentMatrix(deploymentLinks, converter) {
    let self = this;
    return new Promise((resolve) => {
      const values = [];
      deploymentLinks.forEach((link) => {
        values.push({
          ingress: `${link.source.parentNode.site_name}:${link.source.address}`,
          egress: `${link.target.parentNode.site_name}:${link.target.address}`,
          address: link.target.address,
          info: {
            source: {
              site_name: link.source.parentNode.site_name,
              site_id: link.source.parentNode.site_id,
              address: link.source.address,
            },
            target: {
              site_name: link.target.parentNode.site_name,
              site_id: link.target.parentNode.site_id,
              address: link.target.address,
            },
          },
          messages: link.value,
        });
      });
      const matrix = convert(self, values, converter);
      resolve(matrix);
    });
  }

  convertUsing(converter) {
    let values = this.isRate ? this.rateValues : this.last_values.values;
    // convert the values to a matrix using the requested converter and the current filter
    return converter(values, this.filter);
  }
}

// Private functions

// compare the current values to the last_values and return the rate/second
let calcRate = function(values, last_values, snapshots) {
  let now = Date.now();
  if (!last_values.values) {
    last_values.values = values;
    last_values.timestamp = now - 1000;
  }

  // ensure the snapshots are initialized
  if (snapshots.length < SAMPLES) {
    for (let i = 0; i < SAMPLES; i++) {
      if (snapshots.length < i + 1) {
        snapshots[i] = JSON.parse(JSON.stringify(last_values));
        snapshots[i].timestamp = now - 1000 * (SAMPLES - i);
      }
    }
  }
  // remove oldest sample
  snapshots.shift();
  // add the new values to the end.

  snapshots.push(JSON.parse(JSON.stringify(last_values)));

  let oldest = snapshots[0];
  let newest = snapshots[snapshots.length - 1];
  let rateValues = [];
  let elapsed = (newest.timestamp - oldest.timestamp) / 1000;
  let getValueFor = function(snap, value) {
    for (let i = 0; i < snap.values.length; i++) {
      if (
        snap.values[i].ingress === value.ingress &&
        snap.values[i].egress === value.egress &&
        snap.values[i].address === value.address
      )
        return snap.values[i].messages;
    }
  };
  values.forEach(function(value) {
    let first = getValueFor(oldest, value);
    let last = getValueFor(newest, value);
    let rate = (last - first) / elapsed;

    rateValues.push({
      ingress: value.ingress,
      egress: value.egress,
      address: value.address,
      messages: Math.max(rate, MIN_CHORD_THRESHOLD),
    });
  });
  return rateValues;
};

let genKeys = function(values) {
  values.forEach(function(value) {
    value.key = value.egress + value.ingress + value.address;
  });
};
let sortByKeys = function(values) {
  return values.sort(function(a, b) {
    return a.key > b.key ? 1 : a.key < b.key ? -1 : 0;
  });
};
let convert = function(self, values, converter) {
  if (!converter) converter = self.converter;
  // sort the raw data by egress router name
  genKeys(values);
  sortByKeys(values);

  self.last_values.values = JSON.parse(JSON.stringify(values));
  self.last_values.timestamp = Date.now();
  if (self.isRate) {
    self.rateValues = values = calcRate(
      values,
      self.last_values,
      self.snapshots
    );
  }
  // convert the raw data to a matrix
  let matrix = converter(values, self.filter);
  self.last_matrix = matrix;

  return matrix;
};

export { ChordData };
