const { TEXAS_DISCOVERY_QUERIES } = require('./us-acquisition-profile');

const US_ACQUISITION_FRAMEWORK = Object.freeze({
  countryCode: 'US',
  regionCode: 'TX',
  runtimeNamespace: 'us',
  sourceRegistryNamespace: 'us',
  discoveryQueries: Object.freeze([...TEXAS_DISCOVERY_QUERIES]),
  maxDiscoveryResults: 100,
  maxFetchesPerRun: 100,
  serperCreditBudget: 20,
  automaticPublishEnabled: false,
  productionWritesEnabled: false,
  stagingOnly: true
});

function assertUsAcquisitionFramework(config = US_ACQUISITION_FRAMEWORK) {
  if (config.countryCode !== 'US') throw new Error('US acquisition framework must remain country scoped');
  if (config.regionCode !== 'TX') throw new Error('US acquisition framework must remain Texas scoped during pilot');
  if (config.runtimeNamespace !== 'us' || config.sourceRegistryNamespace !== 'us') {
    throw new Error('US acquisition framework namespaces must remain isolated');
  }
  if (config.automaticPublishEnabled !== false || config.productionWritesEnabled !== false || config.stagingOnly !== true) {
    throw new Error('US acquisition framework must remain staging only');
  }
  if (!Number.isInteger(config.maxFetchesPerRun) || config.maxFetchesPerRun < 1 || config.maxFetchesPerRun > 250) {
    throw new Error('US acquisition framework fetch cap must remain bounded');
  }
  if (!Number.isInteger(config.maxDiscoveryResults) || config.maxDiscoveryResults < config.maxFetchesPerRun || config.maxDiscoveryResults > 250) {
    throw new Error('US acquisition framework discovery cap must cover approved-source fetches and remain bounded');
  }
  return true;
}

module.exports = { US_ACQUISITION_FRAMEWORK, assertUsAcquisitionFramework };
