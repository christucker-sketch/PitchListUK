// Scoped to new V3 hosted Checkout sessions. Shared Stripe account/Portal
// branding is deliberately untouched because PitchList uses that account.
export const CHECKOUT_API_VERSION='2025-09-30.clover';
export function checkoutBranding(origin) {
  if(origin!=='https://findpitches.com')throw Error('owned_checkout_brand_origin_required');
  return {
    'branding_settings[display_name]':'FindPitches',
    'branding_settings[background_color]':'#F3F5F0',
    'branding_settings[button_color]':'#0E4B2C',
    'branding_settings[border_style]':'rounded',
    'branding_settings[font_family]':'inter',
    'branding_settings[icon][type]':'url',
    'branding_settings[icon][url]':origin+'/assets/brand/findpitches-icon.png',
    'branding_settings[logo][type]':'url',
    'branding_settings[logo][url]':origin+'/assets/brand/findpitches-logo.png'
  };
}
