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

import React, { Component } from "react";

class SubHeading extends Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  cardIcon = () => {
    if (typeof this.props.info.card.icon === "string") {
      return <i className={`pf-icon pficon-${this.props.info.card.icon}`}></i>;
    }
    return this.props.info.card.getIcon({ scale: 0.5 });
  };

  render() {
    return (
      <div className="sk-subheading">
        {this.cardIcon()}
        {this.props.viewName}
      </div>
    );
  }
}

export default SubHeading;
