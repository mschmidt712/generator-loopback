// Copyright IBM Corp. 2014,2016. All Rights Reserved.
// Node module: generator-loopback
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

var g = require('../lib/globalize');
var url = require('url');
var chalk = require('chalk');
var yeoman = require('yeoman-generator');
var generator = require('./wsdl-loader');
var path = require('path');

var actions = require('../lib/actions');
var helpers = require('../lib/helpers');
var helpText = require('../lib/help');

var fs = require('fs');
var async = require('async');
var workspace = require('loopback-workspace');
var wsModels = workspace.models;

// A list of flags to control whether a model should be generated
var NOT_SELECTED = 0; // It's not selected
var CONFLICT_DETECTED = -1; // A model with the same name exists
var SELECTED_FOR_UPDATE = 1; // Selected for update
var SELECTED_FOR_CREATE = 2; // Selected for create

module.exports = yeoman.Base.extend({

  constructor: function() {
    yeoman.Base.apply(this, arguments);

    this.argument('url', {
      desc: g.f('URL or file path of the WSDL'),
      required: false,
      type: String,
    });

    this.option('config-file', {
      desc: g.f('Build based on config file.'),
      type: String,
    });
  },

  help: function() {
    return helpText.customHelp(this, 'loopback_soap_usage.txt'); // TODO (rashmihunt) add this .txt
  },

  getConfigData: function() {
    var done = this.async();
    var self = this;

    if (this.options['config-file']) {
      this.log(chalk.green(g.f(
        'Configuration file found. Config \n' +
        'file will be used to supply init properties.')));
      fs.readFile(path.resolve('../', this.options['config-file']), ((err, buff) => {
        self.configFile = JSON.parse(buff.toString()).soap || {};
        done();
      }).bind(this));
    } else {
      done();
    }
  },

  loadProject: actions.loadProject,

  loadDataSources: actions.loadDataSources,

  addNullDataSourceItem: actions.addNullDataSourceItem,

  loadModels: actions.loadModels,

  existingModels: function() {
    var self = this;
    self.existingModels = this.modelNames;
  },

  checkForDatasource: function() {
    var self = this;
    self.soapDataSources = this.dataSources.filter(function(ds) {
      return (ds._connector === 'soap') ||
        (ds._connector === 'loopback-connector-soap');
    });

    var soapDataSourceNames = [];
    self.soapDataSources.forEach(function(ds) {
      soapDataSourceNames.push(ds.data.name);
    });

    self.soapDataSourceNames = soapDataSourceNames;
    if (this.soapDataSourceNames.length == 0) {
      var done = this.async();
      var error = chalk.red(g.f('Error: Found no SOAP WebServices' +
        ' data sources for SOAP discovery.' +
        ' Create SOAP Web Service datasource first and try this' +
        ' command again.'));
      this.log(error);
      return false;
    }
  },

  askForDataSource: function() {
    var self = this;
    var prompts = [{
      name: 'dataSource',
      message: g.f('Select the datasource for SOAP' +
        ' discovery'),
      type: 'list',
      choices: this.soapDataSourceNames,
    }];

    if (this.options['config-file'] && this.configFile.datasource) {
      this.selectedDS = this.soapDataSources.find(val => {
        return val.data.name === this.configFile.datasource;
      });

      if (!this.selectedDS) {
        throw new Error(
          'No datasource found with the name ' +
          'provided by the configuraiton file!'
        );
      }

      this.url = this.selectedDS.data.wsdl;
      this.log.info(g.f(
        'SOAP Datasource being set to %s',
        self.selectedDS.data.name));
      this.log(chalk.green(g.f('WSDL for datasource %s: %s',
        self.selectedDS.data.name, self.url)));
    } else {
      return this.prompt(prompts).then(function(answers) {
        this.selectedDSName = answers.dataSource;
        var selectedDS;
        for (var i in this.soapDataSources) {
          var datasource = this.soapDataSources[i];
          if (datasource.data.name === this.selectedDSName) {
            self.selectedDS = datasource;
            break;
          }
        }
        self.url = self.selectedDS.data.wsdl;
        self.log(chalk.green(g.f('WSDL for datasource %s: %s',
          this.selectedDSName, self.url)));
      }.bind(this));
    }
  },

  // command:  slc loopback:soap
  soap: function() {
    var self = this;
    var done = this.async();
    generator.getServices(this.url, this.log, function(err, services) {
      if (err) {
        done(err);
      } else {
        self.services = services;
        var serviceNames = [];
        for (var s in services) {
          serviceNames.push(services[s].$name);
        }
        self.serviceNames = serviceNames;
        done();
      }
    });
  },

  askForService: function() {
    var prompts = [
      {
        name: 'service',
        message: g.f('Select the service:'),
        type: 'list',
        choices: this.serviceNames,
      },
    ];

    if (this.options['config-file'] && this.configFile.service) {
      this.serviceName = this.serviceNames.find(name => {
        return name === this.configFile.service;
      });

      if (!this.serviceName) {
        throw new Error(
          'Service name provided by configuration file does not exist!'
        );
      }

      this.bindingNames = generator.getBindings(this.serviceName);

      this.log.info(g.f(
        'SOAP Service being set to %s',
        this.serviceName));
    } else {
      return this.prompt(prompts).then(function(answers) {
        this.servieName = answers.service;
        this.bindingNames = generator.getBindings(this.servieName);
      }.bind(this));
    }
  },

  askForBinding: function() {
    var prompts = [
      {
        name: 'binding',
        message: g.f('Select the binding:'),
        type: 'list',
        choices: this.bindingNames,
      },
    ];

    if (this.options['config-file'] && this.configFile.binding) {
      this.bindingName = this.bindingNames.find(name => {
        return name === this.configFile.binding;
      });

      if (!this.bindingName) {
        throw new Error(
          'Service name provided by configuration file does not exist!'
        );
      }

      this.operations = generator.getOperations(this.bindingName);

      this.log.info(g.f(
        'SOAP Binding being set to %s',
        this.bindingName));
    } else {
      return this.prompt(prompts).then(function(answers) {
        this.bindingName = answers.binding;
        this.operations = generator.getOperations(this.bindingName);
      }.bind(this));
    }
  },

  askForOperation: function() {
    var prompts = [
      {
        name: 'operations',
        message: g.f('Select operations to be generated:'),
        type: 'checkbox',
        choices: this.operations,
        default: this.operations,
        validate: validateNoOperation,
      },
    ];

    if (this.options['config-file'] && this.configFile.operations) {
      if (this.configFile.operations === 'all') {
        this.operations = this.operations;
      } else if (Array.isArray(this.configFile.operations)) {
        const operations = this.operations.filter(op => {
          return this.configFile.operations.includes(op);
        });

        this.operations = operations;
      } else {
        throw new Error(
          'Operation config must be either an array of available operations ' +
          'or all, to indicate all operations.');
      }

      if (this.operations.length === 0) {
        throw new Error(
          'No operations found that match values given in the ' +
          'configuration file.'
        );
      }

      this.log.info(g.f(
        'The following SOAP operations are being built: %s',
        this.operations));
    } else {
      return this.prompt(prompts).then(function(answers) {
        this.operations = answers.operations;
      }.bind(this));
    }
  },

  generate: function() {
    var self = this;
    var done = this.async();

    this.modelDefs = [];
    this.modelConfigs = [];
    this.modelNames = [];

    var api, i, n, m;
    self.operations = this.operations;
    self.apis = generator.generateAPICode(this.selectedDS.data.name,
      this.operations);

    // eslint-disable-next-line one-var
    for (i = 0, n = self.apis.length; i < n; i++) {
      api = self.apis[i];
      // TODO [rashmi] use binding name for now
      // basePath is used as file name for generated API file and top level API model file.
      // Replace special characters in binding name with _ since these characters are not
      // allowed in filename.
      var basePath = this.bindingName.replace(/[-.\/`~!@#%^&*()-+={}'";:<>,?/]/g, '_');
      var soapModel = 'soap_' + basePath;
      self.modelNames.push(soapModel);
      var modelDef = {
        name: soapModel,
        http: {
          path: basePath,
        },
        base: 'Model',
        forceId: 'false',
        idInjection: 'false',
        excludeBaseProperties: ['id'], // for soap model, we need to exclude if generated in base 'Model'
        facetName: 'server', // hard-coded for now
        properties: {},
      };
      api.modelDefinition = modelDef;
      self.modelDefs.push(modelDef);
      self.modelConfigs.push({
        name: soapModel,
        facetName: 'server', // hard-coded for now
        dataSource: null,
        public: true,
      });
    }

    for (i = 0, n = self.apis.length; i < n; i++) {
      var models = self.apis[i].models;
      for (m in models) {
        var model = models[m];
        if (model.type && model.type !== 'object') {
          // Only handle model of object type (not array or simple types)
          continue;
        }
        self.modelNames.push(m);
        self.modelDefs.push({
          name: model.name,
          plural: model.plural,
          base: model.base || 'Model',
          forceId: 'false',
          idInjection: 'false',
          excludeBaseProperties: ['id'], // for soap model, we need to exclude if generated in base 'Model'
          facetName: 'common', // hard-coded for now
          properties: model.properties,
        });
        self.modelConfigs.push({
          name: model.name,
          facetName: 'server', // hard-coded for now
          dataSource: null,
          public: true,
        });
      }
    }

    function createModel(self, modelDef, cb) {
      function processResult(err, result) {
        if (err) {
          return cb(err);
        }
        if (result) {
          modelDef.scriptPath = result.getScriptPath();
        }
        var propertyNames = Object.keys(modelDef.properties);
        if (propertyNames.length > 0) {
          result.properties.destroyAll(function(err) {
            if (err) {
              return cb(err);
            }
            // 2. Create model properties one by one
            async.eachSeries(propertyNames,
              function(m, done) {
                modelDef.properties[m].name = m;
                modelDef.properties[m].facetName = result.facetName;
                result.properties.create(modelDef.properties[m],
                  function(err) {
                    return done(err);
                  });
              }, function(err) {
                if (!err) {
                  self.log(chalk.green(g.f('Model definition created/updated ' +
                    'for %s.', modelDef.name)));
                }
                cb(err);
              });
          });
        } else {
          self.log(chalk.green(g.f('Model definition created/updated for %s.',
            modelDef.name)));
          cb();
        }
      }

      var result = self.existingModels.find(function(obj) {
        return obj === modelDef.name;
      });

      if (result != null) {
        self.log(chalk.green(g.f('Updating model definition for %s...',
          modelDef.name)));
        modelDef.id = wsModels.ModelDefinition.getUniqueId(modelDef);
        // update the model definition
        wsModels.ModelDefinition.upsert(modelDef, processResult);
      } else {
        self.log(chalk.green(g.f('Creating model definition for %s...',
          modelDef.name)));
        wsModels.ModelDefinition.create(modelDef, processResult);
      }
    }

    function createModelConfig(self, config, cb) {
      if (config.dataSource === undefined) {
        config.dataSource = self.dataSource;
      }
      var result = self.existingModels.find(function(obj) {
        return obj === config.name;
      });

      if (result != null) {
        self.log(chalk.green(g.f('Updating model config for %s...',
          config.name)));
        config.id = wsModels.ModelDefinition.getUniqueId(config);
        wsModels.ModelConfig.upsert(config, function(err) {
          if (!err) {
            self.log(chalk.green(g.f('Model config updated for %s.',
              config.name)));
          }
          return cb(err);
        });
      } else {
        wsModels.ModelConfig.create(config, function(err) {
          self.log(chalk.green(g.f('Creating model config for %s...',
            config.name)));
          if (!err) {
            self.log(chalk.green(g.f('Model config created for %s.',
              config.name)));
          }
          return cb(err);
        });
      }
    }

    function generateRemoteMethods(self, cb) {
      var apis = self.apis;
      async.eachSeries(apis, function(api, done) {
        var modelDef = api.modelDefinition;
        if (!modelDef) {
          return done();
        }
        self.log(chalk.green(g.f('Generating %s', modelDef.scriptPath)));
        fs.writeFile(modelDef.scriptPath, api.code, done);
      }, cb);
    }

    function generateApis(self, cb) {
      async.series([
        // Create model definitions
        function(done) {
          async.each(self.modelDefs, function(def, cb) {
            createModel(self, def, cb);
          }, done);
        },
        // Create model configurations
        function(done) {
          async.each(self.modelConfigs, function(config, cb) {
            createModelConfig(self, config, cb);
          }, done);
        },
        function(done) {
          generateRemoteMethods(self, cb);
        },
      ], cb);
    }

    generateApis(self, function(err) {
      if (!err) {
        self.log(
          chalk.green(g.f('Models are successfully generated from ' +
            '{{WSDL}}.')));
      }
      helpers.reportValidationError(err, self.log);
      done(err);
    });
  },

  saveProject: actions.saveProject,
});
function validateNoOperation(operations) {
  if (operations.length == 0) {
    return g.f('Please select at least one operation.');
  } else {
    return true;
  }
}
