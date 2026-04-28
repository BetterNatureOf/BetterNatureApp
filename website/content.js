// ═══════════════════════════════════════════════════════════════════════════
//  BETTER NATURE — SITE CONTENT
//  ───────────────────────────────────────────────────────────────────────────
//  Edit anything in this file and refresh the page. Nothing else needs to
//  change. Numbers, names, quotes, events, partners — all here.
//
//  Each section is labeled. When in doubt, just replace the words between the
//  quotes or the numbers after the colon.
// ═══════════════════════════════════════════════════════════════════════════

window.CONTENT = {

  // ── SECTION VISIBILITY ────────────────────────────────────────────────
  // Toggle any section on/off from the admin panel. false = hidden.
  sections: {
    mission: true,
    impact: true,
    programs: true,
    impactmap: true,
    how: true,
    chapters: true,
    partners: true,
    testimonials: true,
    team: true,
    events: true,
    press: true,
    donate: true,
    getapp: true,
    signup: true,
  },

  // ── BRAND ─────────────────────────────────────────────────────────────
  brand: {
    name: "Better Nature",
    tagline: "Rescue. Restore. Protect.",
    email: "info@betternatureofficial.org",
    phone: "",
    instagram: "https://instagram.com/official.better.nature",
    twitter: "https://twitter.com/betternature24",
    facebook: "https://facebook.com/betternatureofficial",
    linkedin: "",
    donateUrl: "https://www.zeffy.com/en-US/donation-form/betternature",
    // Zeffy gives you a stable embed URL too — this is what the inline iframe loads.
    donateEmbedUrl: "https://www.zeffy.com/embed/donation-form/betternature",
    // Other ways to give (shown as buttons under the embed). Leave blank to hide.
    giveLinks: {
      paypal: "",       // PayPal Giving Fund URL (zero-fee for nonprofits)
      venmo: "",        // e.g. https://venmo.com/u/betternature
      cashapp: "",      // e.g. https://cash.app/$betternature
      check: "",        // mailing address for checks, or URL with instructions
    },
    appLinks: {
      appStore: "#",
      googlePlay: "#",
      webApp: "https://app.betternatureofficial.org",
    },
  },

  // ── GET THE APP ───────────────────────────────────────────────────────
  getApp: {
    eyebrow: "Take it with you",
    title: "The Better Nature app.",
    body: "Claim shifts, log pickups, track your impact, and connect with your chapter — wherever you are. Scan the code or grab it from your store.",
    qrNote: "Scan to download",
  },

  // ── SIGNUP ────────────────────────────────────────────────────────────
  signup: {
    eyebrow: "Join the network",
    title: "Create your account.",
    body: "Sign up as a restaurant, grocer, or business partner — or as a volunteer. Same network, different doors in.",
    // Forms POST straight to this endpoint — no mail client opens, no page reload.
    // Default: FormSubmit (formsubmit.co) forwards to info@betternatureofficial.org.
    // First submission sends an activation link to info@ — click it once and you're done.
    // To switch providers, replace with your Formspree/Web3Forms URL or a Firebase function.
    submitEndpoint: "https://formsubmit.co/ajax/info@betternatureofficial.org",
    tracks: [
      {
        key: "business",
        label: "Restaurant / business",
        tagline: "Restaurants, grocers, cafés, caterers, corporate kitchens — any business with edible surplus. Free, same-day pickup. Tax-deductible.",
        fields: [
          { name: "businessName", label: "Business name", type: "text", required: true },
          { name: "businessType", label: "Type of business", type: "select", options: ["Restaurant", "Café / bakery", "Grocer / market", "Caterer", "Corporate kitchen", "Hotel", "School / university", "Other"], required: true },
          { name: "contactName", label: "Your name", type: "text", required: true },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "phone", label: "Phone", type: "tel", required: true },
          { name: "city", label: "City & state", type: "text", required: true },
          { name: "volume", label: "Est. surplus / week (lbs)", type: "text", required: false },
          { name: "password", label: "Create a password (6+ chars) — you'll use it to sign in on the Better Nature app too", type: "password", required: true, minLength: 6 },
          { name: "notes", label: "Anything we should know?", type: "textarea", required: false },
        ],
        submit: "Create partner account",
        mailto: "info@betternatureofficial.org",
      },
      {
        key: "volunteer",
        label: "Volunteer",
        tagline: "Pickups, plantings, cleanups. Claim any shift that fits your week.",
        fields: [
          { name: "fullName", label: "Full name", type: "text", required: true },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "phone", label: "Phone", type: "tel", required: false },
          { name: "city", label: "City & state", type: "text", required: true },
          { name: "age", label: "Age", type: "text", required: false },
          { name: "interests", label: "Which program excites you most?", type: "select", options: ["IRIS — Food rescue", "Evergreen — Conservation", "Hydro — Waterways", "All of them"], required: true },
          { name: "availability", label: "When are you free?", type: "textarea", required: false },
          { name: "password", label: "Create a password (6+ chars) — you'll use it to sign in on the Better Nature app too", type: "password", required: true, minLength: 6 },
        ],
        submit: "Create volunteer account",
        mailto: "info@betternatureofficial.org",
      },
      {
        key: "chapter",
        label: "Start a chapter",
        tagline: "Bring Better Nature to your city. Tell us about you and where you want to build — we'll send the chapter playbook, insurance details, and onboarding call invite within 48 hours.",
        fields: [
          { name: "fullName", label: "Your name", type: "text", required: true },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "phone", label: "Phone", type: "tel", required: true },
          { name: "city", label: "City you want to start in", type: "text", required: true },
          { name: "state", label: "State / region", type: "text", required: true },
          { name: "age", label: "Age", type: "text", required: false },
          { name: "affiliation", label: "School, university, or organization (if any)", type: "text", required: false },
          { name: "experience", label: "Any leadership / volunteer experience?", type: "textarea", required: false },
          { name: "why", label: "Why do you want to start a chapter here?", type: "textarea", required: true },
          { name: "timeline", label: "When are you hoping to launch?", type: "select", options: ["This month", "1–3 months", "3–6 months", "Just exploring"], required: false },
        ],
        submit: "Apply to start a chapter",
        mailto: "info@betternatureofficial.org",
      },
    ],
  },

  // ── HERO ──────────────────────────────────────────────────────────────
  hero: {
    eyebrow: "Food rescue · Reforestation · Waterways",
    headline: "Feed people. Plant forests.",
    headlineItalic: "Protect the water.",
    subhead: "Better Nature is a youth-led nonprofit rescuing surplus food, planting native trees, and cleaning the waterways that communities depend on — three programs, one mission.",
    primaryCta: { text: "Read our mission", href: "#mission" },
    secondaryCta: { text: "Partner your business", href: "#signup" },
    // Tile 1 (top-left, biggest): forest. Tile 2 (top-right): clean water.
    // Tile 3 (bottom-left): produce crate. Tile 4 (bottom-right): planting/volunteers.
    media: [
      { src: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=900&q=80&auto=format&fit=crop", alt: "Sunlit forest canopy" },
      { src: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=900&q=80&auto=format&fit=crop", alt: "Clear mountain lake" },
      { src: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=900&q=80&auto=format&fit=crop", alt: "Crate of fresh vegetables" },
      { src: "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=900&q=80&auto=format&fit=crop", alt: "Volunteer planting a tree" },
    ],
    tickerStats: [
      { value: "6,963", label: "meal kits delivered" },
      { value: "2,780 lbs", label: "food distributed" },
      { value: "6,963", label: "individuals served" },
      { value: "10,564 lbs", label: "CO₂ avoided" },
      { value: "486,500 gal", label: "water footprint reduced" },
    ],
  },

  // ── MISSION ───────────────────────────────────────────────────────────
  mission: {
    eyebrow: "Our mission",
    title: "We refuse the world where food gets thrown out while people go hungry.",
    body: "Better Nature is a youth-led 501(c)(3) nonprofit building the infrastructure to redirect surplus food, restore ecosystems, and protect communities from climate harm. We operate across three interlocking programs — because the climate crisis, the hunger crisis, and the biodiversity crisis are the same crisis. We don't wait for permission. We build the pickup route, plant the tree, clean the waterway, and train the next chapter leader.",
    pillars: [
      {
        number: "01",
        title: "Rescue what's wasted.",
        body: "40% of food in America never gets eaten. We route the edible surplus from restaurants, grocers, and farms to neighbors who need a meal tonight.",
      },
      {
        number: "02",
        title: "Regenerate what's lost.",
        body: "We plant trees, restore urban canopy, and protect waterways in the same communities we feed — because food security and climate resilience are built together.",
      },
      {
        number: "03",
        title: "Empower the next generation.",
        body: "Every chapter is run by young people. We give volunteers real operational responsibility, real leadership tracks, and real tools to ship impact in their own city.",
      },
    ],
  },

  // ── IMPACT NUMBERS (big hero counters) ────────────────────────────────
  impact: {
    eyebrow: "The receipts",
    title: "Real numbers. Real neighbors. Real forests.",
    stats: [
      { value: "6,963", label: "Meal kits delivered", sublabel: "From rescued surplus to neighbors who need them" },
      { value: "2,780", label: "Pounds of food distributed", sublabel: "Direct from partner kitchens to recipients" },
      { value: "6,963", label: "Individuals served", sublabel: "Across our active chapters" },
      { value: "10,564", label: "Pounds of CO₂ avoided", sublabel: "Emissions prevented by diverting food from landfills" },
      { value: "486,500", label: "Gallons of water saved", sublabel: "Embedded water footprint of the food we rescued" },
      { value: "4", label: "Events run", sublabel: "Pickups, cleanups, and chapter actions to date" },
    ],
  },

  // ── PROGRAMS ──────────────────────────────────────────────────────────
  programs: {
    eyebrow: "Three programs. One mission.",
    title: "How we work.",
    items: [
      {
        key: "iris",
        code: "01 — IRIS",
        title: "Food rescue.",
        body: "Restaurant surplus, same-day pickup, direct delivery to shelters, community fridges, and families on our recipient list. Free for partners. Tax-deductible. Weighed, logged, reported.",
        stats: [
          { value: "6,963", label: "meal kits delivered" },
          { value: "2,780 lbs", label: "food rescued" },
          { value: "10,564 lbs", label: "CO₂ avoided" },
        ],
        cta: { text: "Become a partner business", href: "#signup" },
      },
      {
        key: "evergreen",
        code: "02 — EVERGREEN",
        title: "Conservation & reforestation.",
        body: "Native tree planting, urban canopy restoration, pollinator corridors, and invasive species removal — led by chapter volunteers in coordination with municipal parks and land trusts.",
        stats: [
          { value: "Launching", label: "first planting day" },
          { value: "Memphis", label: "founding chapter" },
        ],
        cta: { text: "Join a planting day", href: "#events" },
      },
      {
        key: "hydro",
        code: "03 — HYDRO",
        title: "Waterway protection.",
        body: "River, creek, and coastline cleanups. Microplastic surveys. Storm drain stenciling. We protect the waterways the people we feed depend on.",
        stats: [
          { value: "486,500 gal", label: "water footprint reduced" },
          { value: "Launching", label: "first cleanup" },
        ],
        cta: { text: "Find a cleanup near you", href: "#chapters" },
      },
    ],
  },

  // ── FOOD INSECURITY MAP ───────────────────────────────────────────────
  insecurity: {
    eyebrow: "The gap we're closing",
    title: "1 in 8 Americans doesn't know where their next meal is coming from.",
    body: "Food insecurity isn't evenly distributed. These are the counties where the gap is widest — and where our chapters are building the pickup routes that close it.",
    stats: [
      { value: "47M", label: "Americans are food insecure" },
      { value: "13M", label: "children affected" },
      { value: "40%", label: "of US food is wasted" },
      { value: "$1.2T", label: "wasted annually" },
    ],
  },

  // ── HOW IT WORKS ──────────────────────────────────────────────────────
  howItWorks: {
    eyebrow: "Get involved",
    title: "Two ways in. One network.",
    tracks: [
      {
        label: "For restaurants, grocers & businesses",
        tagline: "Turn your surplus into tax-deductible impact — free, easy, same-day pickup.",
        steps: [
          { num: "01", title: "15-min partner call", body: "Tell us your kitchen, your volume, your schedule. We match you to a chapter." },
          { num: "02", title: "Set your pickup window", body: "Daily, weekly, or on-call. Our volunteers arrive in uniform, on time, with our insurance on file." },
          { num: "03", title: "We handle everything", body: "We weigh, photograph, and log every pickup. Your staff just hands us the tray." },
          { num: "04", title: "Tax receipt + impact report", body: "Monthly statement with weight, meal equivalents, CO₂ avoided, and your Bill Emerson Act protection." },
        ],
        cta: { text: "Sign your business up", href: "#signup" },
      },
      {
        label: "For volunteers",
        tagline: "Your leftovers can feed a family tonight. We handle everything.",
        steps: [
          { num: "01", title: "Find your chapter", body: "Memphis is our founding chapter. Don't see yours? Start one." },
          { num: "02", title: "Attend an orientation", body: "45 minutes. Meet your chapter president. Learn the routes." },
          { num: "03", title: "Claim a shift", body: "Pickups, plantings, cleanups — claim any shift that fits your week." },
          { num: "04", title: "Log your impact", body: "Every pound rescued, hour served, and tree planted goes on your profile and the chapter leaderboard." },
        ],
        cta: { text: "Sign up to volunteer", href: "#chapters" },
      },
    ],
  },

  // ── TEAM / LEADERSHIP ─────────────────────────────────────────────────
  team: {
    eyebrow: "The people",
    title: "Youth-led. Community-rooted.",
    body: "Better Nature is run end-to-end by young organizers. Our national leadership team coordinates chapter presidents across the country.",
    members: [
      // Add real team members here. Each member: name, role, city, bio (short), photo (optional)
      { name: "Satvik Koya", role: "Founder & Executive Director", city: "Memphis, TN", bio: "High school junior. Started Better Nature after seeing surplus trays thrown out behind his local restaurants.", photo: "" },
    ],
  },

  // ── TESTIMONIALS ──────────────────────────────────────────────────────
  // Add real quotes from real partners and volunteers as they come in.
  testimonials: [],

  // ── PRESS / NEWS ──────────────────────────────────────────────────────
  press: {
    eyebrow: "In the news",
    title: "Who's covering us.",
    articles: [
      // Add real press coverage as it comes in.
    ],
    pressLogos: [],
  },

  // ── EVENTS ────────────────────────────────────────────────────────────
  // Add real upcoming events here. Dates in YYYY-MM-DD format.
  events: [],

  // ── CHAPTERS ──────────────────────────────────────────────────────────
  chapters: {
    eyebrow: "Find your chapter",
    title: "Founded in Memphis. Growing.",
    body: "Don't see your city? Start a chapter. We give you the playbook, the insurance, the partner introductions, and the onboarding — you give us the weekends.",
    featured: [
      {
        city: "Memphis", state: "TN", president: "Satvik Koya",
        instagram: "https://instagram.com/official.better.nature",
        blurb: "Our founding chapter. Weekly pickups, neighborhood deliveries, and the foundation we're scaling everything else from.",
        roster: [
          { name: "Satvik Koya", role: "Founder & Chapter President", instagram: "" },
        ],
      },
    ],
    totalCities: 1,
    startChapterUrl: "#signup",
  },

  // ── PARTNER RESTAURANTS / SPONSORS ────────────────────────────────────
  partners: {
    eyebrow: "Restaurant, grocer & business partners",
    title: "Businesses that refuse to waste.",
    body: "Restaurants, cafés, grocers, bakeries, caterers, corporate kitchens, hotels, schools — any business with edible surplus. All pickups are free, scheduled, and tax-deductible under the Bill Emerson Good Samaritan Food Donation Act.",
    // Each partner: name (required). Optional: website, instagram, logo (image URL).
    // Add real partners here as they come on board.
    logos: [],
    pitch: {
      title: "Turn your surplus into tax-deductible impact.",
      body: "Free. Easy. Same-day pickup. Your leftovers feed a family tonight, and you get a monthly report with weight rescued, meal equivalents, CO₂ avoided, and your tax receipt.",
      cta: { text: "Start the 15-min partner call", href: "#signup" },
    },
  },

  // ── DONATE ────────────────────────────────────────────────────────────
  donate: {
    eyebrow: "Fuel the work",
    title: "Every dollar moves a meal, plants a tree, or protects a waterway.",
    body: "Better Nature runs on donations. Zero overhead skimming — we use Zeffy, the only truly zero-fee donation platform for nonprofits. 100% of your gift goes to chapters.",
    tiers: [
      { amount: "$25", impact: "Helps fuel volunteer pickup routes" },
      { amount: "$100", impact: "Goes toward planting native trees in the communities we serve" },
      { amount: "$500", impact: "Supports a chapter's weekend pickup operations" },
      { amount: "$2,500", impact: "Helps launch a new chapter from orientation to first shift" },
    ],
    cta: { text: "Open full donation form", href: "https://www.zeffy.com/en-US/donation-form/betternature" },
  },

  // ── NEWSLETTER ────────────────────────────────────────────────────────
  newsletter: {
    title: "The monthly rescue report.",
    body: "One email a month. Numbers, stories, new chapters, restaurant partner highlights. No fluff.",
    placeholder: "you@example.com",
    cta: "Subscribe",
    // Replace with your Mailchimp / ConvertKit / Substack form action
    formAction: "",
  },
};
