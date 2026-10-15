import {i18n} from '../../web/findpitches-v3-web/server/i18n.mjs';
import {customerError} from './customer-security.mjs';

export {i18n};
export function customerLanguage(value) {
  if(value===undefined||value===null)return 'en';
  if(typeof value!=='string'||!Object.hasOwn(i18n.languages,value))throw customerError('validation');
  return value;
}
export const customerReturnPath=(path,locale)=>i18n.pathFor(path,customerLanguage(locale));
export function localisedDocument(markup,locale) {
  return i18n.markup(markup,locale).replace(/<html\s+lang="[^"]*"/,`<html lang="${locale}"`);
}
export function signInMail(locale,link) {
  const lang=customerLanguage(locale),tr=message=>i18n.tr(message,[],lang);
  return {subject:tr('Sign in to FindPitches'),text_body:tr('Your one-time FindPitches sign-in link expires in 15 minutes:')+'\n'+link+'\n'+tr('If you did not request it, ignore this email.')};
}
