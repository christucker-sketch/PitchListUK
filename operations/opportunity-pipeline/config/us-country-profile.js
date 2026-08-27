export const US_COUNTRY_PROFILE = Object.freeze({
  countryCode: 'US',
  countryName: 'United States',
  currency: 'USD',
  postalLabel: 'ZIP Code',
  defaultDistanceUnit: 'miles',
  dateOrder: 'MDY',
  enabledStates: Object.freeze(['TX']),
  runtimeNamespace: 'us',
  sourceRegistryNamespace: 'us',
  publication: Object.freeze({
    automaticPublishEnabled: false,
    requireCountryCode: true,
    requireJurisdictionPrefix: 'US-',
    additionOnly: true,
  }),
});

export function assertUsCountryProfile(profile = US_COUNTRY_PROFILE) {
  if (!profile || profile.countryCode !== 'US') {
    throw new Error('US country profile must declare countryCode=US');
  }

  if (profile.runtimeNamespace !== 'us') {
    throw new Error('US runtime namespace must remain isolated as us');
  }

  if (profile.sourceRegistryNamespace !== 'us') {
    throw new Error('US source registry namespace must remain isolated as us');
  }

  if (profile.publication?.automaticPublishEnabled !== false) {
    throw new Error('US automatic publishing must remain disabled during foundation stage');
  }

  return true;
}
