// Set this to false (or just delete it) to allow this console to call GET /services
const NODE_ENV_DEV = "development";
const NODE_ENV_TST = "test";
class RESTService {
  constructor() {
    this.url = `${window.location.protocol}//${window.location.host}`;
    //this.url =
    //  "https://skupper-default.grs1-153f1de160110098c1928a6c05e19444-0000.eu-gb.containers.appdomain.cloud";
    //console.log(`default REST url is ${this.url}`);
  }

  getData = () =>
    new Promise((resolve, reject) => {
      if (process.env.NODE_ENV === NODE_ENV_TST) {
        // the require statement must be passed a variable instead of a string literal.
        // Otherwise the browser will attempt to load the file when the code is compiled instead of at run-time.
        const testfile = "../public/data/testing.json";
        // eslint-disable-next-line
        const data = require(testfile);
        resolve(data);
      } else if (process.env.NODE_ENV === NODE_ENV_DEV) {
        // This is used to get the data when the console
        // is served by yarn start or npm start
        this.fetchFrom("/data/DATA.json")
          .then(resolve)
          .catch((error) => {
            reject(error);
          });
      } else {
        // try from the window url
        this.fetchFrom(`${this.url}/DATA`)
          .then(resolve)
          .catch((error) => {
            reject(error);
          });
      }
    });

  getSiteInfo = (VAN) =>
    new Promise((resolve) => {
      let url = `${this.url}/`;
      let suffix = ".json";

      if (process.env.NODE_ENV === NODE_ENV_DEV) {
        url = "/data/";
      } else if (process.env.NODE_ENV === NODE_ENV_TST) {
        url = "../public/data/";
      } else {
        suffix = "";
      }
      let endpoints = ["site", "tokens", "links", "services", "targets"];
      let promises = endpoints.map((endpoint) =>
        this.fetchFrom(`${url}${endpoint}${suffix}`, endpoint === "site")
      );
      Promise.allSettled(promises).then((allResults) => {
        const results = {};
        endpoints.forEach((endpoint, i) => {
          results[endpoint] =
            allResults[i].status === "fulfilled"
              ? allResults[i].value
              : endpoint === "site"
              ? "" // if the site call failed, use empty string
              : []; // call failed. use empty array as result
        });
        // fold targets into services
        results.targets.forEach((target) => {
          const resident = results.services.find(
            (service) => service.name === target.name
          );
          if (resident) {
            if (
              resident.endpoints &&
              resident.endpoints.find((endp) => endp.target === target.name)
            ) {
              resident.exposed = true;
              resident.type = target.type;
              resident.ports = target.ports;
            }
          } else {
            // there is no service that matches this target
            const available = {
              name: target.name,
              type: target.type,
              endpoints: null,
              exposed: false,
            };
            results.services.push(available);
          }
        });
        // TODO: do this somewhere else after the data is retrieved
        /*
        results.targets.forEach((target) => {
          const deployed = results.services.find(
            (service) => service.name === target.name
          );
          if (deployed) {
            deployed.exposed = true;
            deployed.type = target.type;
            deployed.ports = target.ports;
          } else {
            const index = results.services.push(target);
            const notDeployed = results.services[index - 1];
            notDeployed.exposed = false;
            notDeployed.endpoints = target;
          }
        });
        */

        // the call to GET /site should return the site_id of the current site
        results.site = results.site.trim();
        let currentSite = VAN.sites.find(
          (site) => site.site_id === results.site
        );
        if (!currentSite) {
          console.error(
            `restService::getSiteInfo !currentSite site returned is ${results.site}`
          );
          currentSite = VAN.sites[0];
        }
        results["site_name"] = currentSite.site_name;
        results["site_id"] = currentSite.site_id;
        results["Site type"] = currentSite["Site type"];
        results["namespace"] = currentSite.namespace;
        resolve(results);
      });
    });

  // create a link
  uploadToken = (data) => {
    let obj = data;

    try {
      obj = JSON.parse(data);
    } catch (e) {
      obj = { data };
    }
    return this.postSiteInfoMethod(obj, "POST", "links");
  };

  // delete a link
  unlinkSite = (data) =>
    this.postSiteInfoMethod(data, "DELETE", "links", data.name);

  // create a token
  // called when the user requests that a token be copied to the clipboard
  getTokenData = () => {
    return new Promise((resolve, reject) => {
      this.postSiteInfoMethod({}, "POST", "tokens").then(
        (results) => {
          //success
          results.text().then(resolve);
        },
        (e) => {
          // failure
          if (
            process.env.NODE_ENV === NODE_ENV_DEV ||
            process.env.NODE_ENV === NODE_ENV_TST
          ) {
            const url =
              process.env.NODE_ENV === NODE_ENV_DEV
                ? "/data/token.json"
                : "../public/data/token.json";
            this.fetchFrom(url).then(resolve, reject);
          } else {
            reject(e);
          }
        }
      );
    });
  };

  // delete a token
  deleteToken = (data) =>
    this.postSiteInfoMethod(data, "DELETE", "tokens", data.name);

  // update a token
  updateToken = (data) =>
    this.postSiteInfoMethod(data, "UPDATE", "tokens", data.name);

  // create a deployment
  exposeService = (data) => this.postSiteInfoMethod(data, "POST", "services");

  // delete a deployment
  unexposeService = (data) =>
    this.postSiteInfoMethod(data, "DELETE", "services", data.name);

  // update a site's name
  renameSite = (data) =>
    this.postSiteInfoMethod(data, "UPDATE", "site", data.site_id);

  // revoke site's certificate authority
  regenCA = () => this.postSiteInfoMethod({}, "DELETE", "certificateAuthority");

  // POST the data using method
  postSiteInfoMethod = (data, method, type, name) => {
    return new Promise((resolve, reject) => {
      let url = `${this.url}/${type}`;
      if (name) {
        url = `${url}/${encodeURIComponent(name)}`;
      }
      fetch(url, {
        method,
        body: JSON.stringify(data),
      })
        .then(
          (response) => {
            if (!response.ok) {
              const forname = name ? ` for ${name}` : "";
              console.log(
                `${method} to ${type}${forname} with data ${JSON.stringify(
                  data,
                  null,
                  2
                )} returned with a status of ${response.status}`
              );
              const e =
                response.status === 404
                  ? new Error(`${method}::${type} not implemented`)
                  : new Error(
                      `${method} ${type} ${response.statusText} (${response.status})`
                    );
              console.log("rejecting with error");
              console.log(e);
              reject(e);
            } else {
              resolve(response);
            }
          },
          (error) => {
            console.log(`error ${method}::${type} `);
            console.log(error);
            reject(error);
          }
        )
        .catch((error) => {
          // server error
          const e = new Error(`Failed with error ${error.status}`);
          reject(e);
        });
    });
  };

  // needed when the token is saved directly to a file
  getSkupperTokenURL = () => `${this.url}/downloadclaim`;

  fetchFrom = (url, asText) =>
    new Promise((resolve, reject) => {
      let status;
      fetch(url)
        .then((res) => {
          status = res.status;
          return !asText ? res.json() : res.text();
        })
        .then((data) => {
          if (!asText) {
            data.status = status;
          }
          resolve(data);
        })
        .catch((error) => {
          error.status = status;
          reject(error);
        });
    });
}

export default RESTService;
