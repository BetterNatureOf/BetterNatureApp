// Hash-based URL routing for React Navigation on web.
//
// Why hash instead of pathname: Expo's web dev server (and many static hosts)
// don't fall back unknown paths to index.html, so reloading at /settings
// returns 404 or redirects to / *before* the app loads. Hash fragments
// (`/#/settings`) never hit the server, so reload is bulletproof.
import { Platform } from 'react-native';

const screens = {
  // Auth flow
  Login: 'login',
  SignupStep1: 'signup',
  SignupStep2: 'signup/chapter',
  SignupStep3: 'signup/verify',
  StartChapter: 'start-chapter',

  MainTabs: {
    path: '',
    screens: {
      Dashboard: 'home',
      Projects: 'projects',
      Impact: 'impact',
      Donate: 'donate',
      Manage: 'manage',
      Profile: 'profile',
    },
  },
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
  PickupDetail: 'pickups/:pickupId',
  ChapterChecklist: 'chapter',
  Refer: 'refer',

  RestDashboard: 'restaurant',
  ScheduleDonation: 'restaurant/post',
  DonationHistory: 'restaurant/history',
  TaxReceipts: 'restaurant/receipts',

  AdminPanel: 'admin',
  ManageChapters: 'admin/chapters',
  ManageMembers: 'admin/members',
  ManageRestaurants: 'admin/restaurants',
  ManageFridges: 'admin/fridges',
  ManageVerifications: 'admin/verifications',
  LiabilityWaiver: 'sign-waiver',
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
  CheckIn: 'check-in',
  ImpactMap: 'map',
  FoodInsecurityMap: 'food-map',
};

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

// Hash overrides — RN Navigation reads pathname by default, so we hand it the
// hash value via getInitialURL/subscribe and write to it via getPathFromState.
const linking = {
  prefixes: isWeb ? [window.location.origin] : [],
  config: { screens },
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
        getStateFromPath: undefined, // use default
        getPathFromState: undefined, // use default
      }
    : {}),
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
