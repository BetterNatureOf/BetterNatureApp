// Hash-based URL routing for React Navigation on web.
//
// Why hash instead of pathname: Expo's web dev server (and many static hosts)
// don't fall back unknown paths to index.html, so reloading at /settings
// returns 404 or redirects to / *before* the app loads. Hash fragments
// (`/#/settings`) never hit the server, so reload is bulletproof.
import { Linking, Platform } from 'react-native';
import { getStateFromPath as defaultGetStateFromPath, getPathFromState as defaultGetPathFromState } from '@react-navigation/native';

const screens = {
  // Auth flow
  Login: 'login',
  SignupStep1: 'signup',
  SignupStep2: 'signup/chapter',
  SignupStep3: 'signup/verify',
  StartChapter: 'start-chapter',
  RestaurantSignup: 'signup/restaurant',

  MainTabs: {
    path: '',
    screens: {
      Dashboard: 'home',   // "Home" tab label; renders role-appropriate dashboard
      Rescue:    'rescue',
      Projects:  'do',     // Keep the existing Programs link
      Belong:    'belong', // "Belong" tab (Phase 1 slice 3)
      Manage:    'manage', // exec/pres/founder only — surfaces via ManageTab dispatcher
      Profile:   'you',    // "You" tab label
    },
  },
  Donate: 'donate',
  Leaderboard: 'leaderboard',
  ProjectDetail: 'projects/:project',
  Iris: 'iris',
  Evergreen: 'evergreen',
  Hydro: 'hydro',
  AnimalGallery: 'animals',
  EventDetail: 'events/:id',
  Notifications: 'notifications',
  About: 'about',
  Settings: 'settings',
  EditProfile: 'profile/edit',
  ChangePassword: 'profile/password',
  ConnectedAccounts: 'profile/connected-accounts',
  VerifyId: 'profile/verify',
  Pickups: 'pickups',
  PickupDetail: 'pickups/:pickupId',
  ChapterChecklist: 'chapter',
  NotificationPreferences: 'notifications/prefs',
  VehicleSetup: 'profile/vehicle',
  WebsiteContent: 'admin/website',
  FindChapter: 'find-chapter',
  MyTaxReceipts: 'tax-receipts',
  Refer: 'refer',

  RestDashboard: 'restaurant',
  ScheduleDonation: 'restaurant/post',
  DonationHistory: 'restaurant/history',
  TaxReceipts: 'restaurant/receipts',

  AdminPanel: 'admin',
  ApprovalInbox: 'admin/inbox',
  ManageChapters: 'admin/chapters',
  ManageMembers: 'admin/members',
  ManageRestaurants: 'admin/restaurants',
  ManageFridges: 'admin/fridges',
  ManageVerifications: 'admin/verifications',
  LiabilityWaiver: 'sign-waiver',
  DriverSetup: 'driver-setup',
  SignContract: 'contracts/sign/:kind',
  ContractView: 'contracts/view/:kind',
  MyContracts:     'profile/contracts',   // legacy slug
  AgreementCenter: 'you/agreements',      // new IA slug
  ManageContracts: 'admin/contracts',
  GlobalHistory: 'admin/history',
  Broadcast: 'admin/broadcast',
  ExportReports: 'admin/reports',

  PresEvents: 'pres/events',
  PresReports: 'pres/reports',
  PresMembers: 'pres/members',
  PresBroadcast: 'pres/broadcast',
  ExecFinance: 'exec/finance',
  ExecMetrics: 'exec/metrics',
  PresMetrics: 'pres/metrics',
  PresFinance: 'pres/finance',
  CheckIn: 'check-in',
  BNMap: 'map',
  ImpactMap: 'impact-map',
  FoodInsecurityMap: 'food-map',
};

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
const nativePrefix = 'betternature://';

// React Navigation 7's web linking ignores getInitialURL/subscribe and
// reads window.location.pathname — always "/" with hash routing — on
// load and on popstate. Resolve that "/" from the hash instead, so cold
// links like /#/pickups/<id> (the URL every rescue alert carries) open
// the right screen.
function currentHashPath() {
  if (!isWeb) return null;
  const hash = window.location.hash || '';
  const path = hash.startsWith('#') ? hash.slice(1) : hash;
  return path && path !== '/' ? path : null;
}
const AUTH_PATHS = /^\/?(welcome|login|signup|start-chapter)(\/|\?|$)/i;

// The link the page was opened with, kept until the signed-in app is
// on screen: sign-in (or a slow session restore) renders the auth
// navigator first, which would otherwise overwrite it with #/Welcome.
let bootDeepLink = isWeb && currentHashPath() && !AUTH_PATHS.test(currentHashPath()) ? currentHashPath() : null;

export function restoreBootDeepLink() {
  if (!isWeb || !bootDeepLink) return;
  const target = bootDeepLink;
  bootDeepLink = null;
  if (currentHashPath() !== target) window.history.replaceState(null, '', `/#${target}`);
}

function pickupNotificationUrl(response) {
  const data = response?.notification.request.content.data;
  if (data?.type !== 'pickup_available' || typeof data.pickupId !== 'string' ||
      !/^[a-zA-Z0-9_-]+$/.test(data.pickupId)) return null;
  return `${nativePrefix}pickups/${data.pickupId}`;
}

// Hash overrides — RN Navigation reads pathname by default, so we hand it the
// hash value via getInitialURL/subscribe and write to it via getPathFromState.
const linking = {
  prefixes: isWeb ? [window.location.origin] : [nativePrefix],
  config: { screens },
  // In-memory preview objects (e.g. PickupDetail's `pickup`) must not be
  // serialized into the URL as "[object Object]".
  getPathFromState(state, options) {
    const path = defaultGetPathFromState(state, options);
    const [base, query] = path.split('?');
    if (!query) return path;
    const kept = query.split('&').filter((pair) => !/^pickup=/.test(pair));
    return kept.length ? `${base}?${kept.join('&')}` : base;
  },
  getStateFromPath(path, options) {
    const resolved = (!path || path === '/') && currentHashPath() ? currentHashPath() : path;
    return defaultGetStateFromPath(resolved, options);
  },
  ...(isWeb
    ? {
        getInitialURL() {
          // Read the hash on cold load. window.location.hash includes the
          // leading "#", so trim it and stitch onto the origin.
          const hash = window.location.hash || '';
          const path = hash.startsWith('#') ? hash.slice(1) : hash;
          return window.location.origin + (path || '/');
        },
        subscribe(listener) {
          const onHash = () => {
            const hash = window.location.hash || '';
            const path = hash.startsWith('#') ? hash.slice(1) : hash;
            listener(window.location.origin + (path || '/'));
          };
          window.addEventListener('hashchange', onHash);
          return () => window.removeEventListener('hashchange', onHash);
        },
        // When RN Navigation's state changes, mirror the resulting path into
        // the hash so reload re-reads it. We override history via the default
        // mechanism but force it through window.location.hash.
      }
    : {
        async getInitialURL() {
          const url = await Linking.getInitialURL();
          if (url) return url;
          try {
            const notifications = require('expo-notifications');
            const target = pickupNotificationUrl(await notifications.getLastNotificationResponseAsync());
            if (target) notifications.clearLastNotificationResponse();
            return target;
          } catch {
            return null;
          }
        },
        subscribe(listener) {
          const links = Linking.addEventListener('url', ({ url }) => listener(url));
          let push;
          try {
            const notifications = require('expo-notifications');
            push = notifications.addNotificationResponseReceivedListener((response) => {
              const url = pickupNotificationUrl(response);
              if (!url) return;
              notifications.clearLastNotificationResponse();
              listener(url);
            });
          } catch {}
          return () => { links.remove(); push?.remove(); };
        },
      }),
};

// Wire RN Navigation's path → hash. We do this by patching history methods
// once at boot so any pushState/replaceState that RN does ends up in the hash
// instead of the pathname.
if (isWeb) {
  const origPush = window.history.pushState.bind(window.history);
  const origReplace = window.history.replaceState.bind(window.history);
  function toHashUrl(url) {
    if (typeof url !== 'string') return url;
    try {
      const u = new URL(url, window.location.origin);
      // Already a hash URL — leave alone
      if (u.pathname === '/' && u.hash) return u.toString();
      const path = u.pathname + u.search;
      return window.location.origin + '/#' + path;
    } catch {
      return url;
    }
  }
  window.history.pushState = (state, title, url) => origPush(state, title, toHashUrl(url));
  window.history.replaceState = (state, title, url) => origReplace(state, title, toHashUrl(url));
}

export default linking;
