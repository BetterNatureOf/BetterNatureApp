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
    ],
  },

  // ── HERO ──────────────────────────────────────────────────────────────
  hero: {
    eyebrow: "Food rescue · Reforestation · Waterways",
    headline: "Feed people. Plant forests.",
    headlineItalic: "Protect the water.",
    subhead: "Better Nature is a youth-led nonprofit rescuing surplus food, planting native trees, and cleaning the waterways that communities depend on — three programs, one mission, 38 cities.",
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
      { value: "12,840", label: "trees planted" },
      { value: "1.2M", label: "meals rescued" },
      { value: "86.5K gal", label: "waterway cleaned" },
      { value: "38", label: "cities" },
      { value: "2,400+", label: "volunteers" },
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
      { value: "1,247,000", label: "Meals rescued", sublabel: "Pounds × 1.2 conversion from partner restaurants" },
      { value: "12,840", label: "Trees planted", sublabel: "Across 14 urban reforestation sites" },
      { value: "86,500", label: "Gallons of waterway cleaned", sublabel: "Through Project Hydro cleanups" },
      { value: "4,200", label: "Animals supported", sublabel: "Via partner sanctuaries and rescue networks" },
      { value: "38", label: "Active chapters", sublabel: "In cities across the US" },
      { value: "2,400", label: "Volunteers mobilized", sublabel: "This year alone" },
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
          { value: "1.2M+", label: "meals rescued" },
          { value: "180", label: "partner restaurants" },
          { value: "< 2hrs", label: "pickup to table" },
        ],
        cta: { text: "Become a partner business", href: "#signup" },
      },
      {
        key: "evergreen",
        code: "02 — EVERGREEN",
        title: "Conservation & reforestation.",
        body: "Native tree planting, urban canopy restoration, pollinator corridors, and invasive species removal — led by chapter volunteers in coordination with municipal parks and land trusts.",
        stats: [
          { value: "12,840", label: "trees planted" },
          { value: "14", label: "restoration sites" },
          { value: "23 acres", label: "restored habitat" },
        ],
        cta: { text: "Join a planting day", href: "#events" },
      },
      {
        key: "hydro",
        code: "03 — HYDRO",
        title: "Waterway protection.",
        body: "River, creek, and coastline cleanups. Microplastic surveys. Storm drain stenciling. We protect the waterways the people we feed depend on.",
        stats: [
          { value: "86.5K", label: "gallons cleaned" },
          { value: "42", label: "cleanup events" },
          { value: "3.2 tons", label: "debris removed" },
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
          { num: "01", title: "Find your chapter", body: "We have chapters in 38 cities. Don't see yours? Start one." },
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
      // Replace these with your real team. Each member: name, role, city, bio (short), photo (optional)
      { name: "Satvik Koya", role: "Founder & Executive Director", city: "Memphis, TN", bio: "High school junior. Started Better Nature after seeing surplus trays thrown out behind his local restaurants.", photo: "" },
      { name: "Add your co-founder", role: "Co-Founder & COO", city: "", bio: "Replace this with a real bio.", photo: "" },
      { name: "Add a chapter president", role: "Chapter President, [City]", city: "", bio: "Replace this with a real bio.", photo: "" },
      { name: "Add an advisor", role: "Board Advisor", city: "", bio: "Replace this with a real bio.", photo: "" },
    ],
  },

  // ── TESTIMONIALS ──────────────────────────────────────────────────────
  testimonials: [
    {
      quote: "We used to throw out three full pans of food every night. Now it's in someone's hands within two hours. That's the most impact-per-minute we've ever gotten from anything.",
      name: "Add real name",
      role: "Owner, Add real restaurant name",
      city: "Memphis, TN",
    },
    {
      quote: "I joined to rescue food. I stayed because I got to lead a chapter of 80 people before I turned 17.",
      name: "Add real volunteer name",
      role: "Chapter President",
      city: "Add city",
    },
    {
      quote: "Better Nature's volunteers show up on time, in uniform, every single week. They made our surplus program possible.",
      name: "Add real name",
      role: "Add real title",
      city: "Add city",
    },
  ],

  // ── PRESS / NEWS ──────────────────────────────────────────────────────
  press: {
    eyebrow: "In the news",
    title: "Who's covering us.",
    articles: [
      { date: "2026-03-12", outlet: "Local Memphis Paper", title: "Teen-led nonprofit rescues 1M meals in under two years", href: "" },
      { date: "2026-02-04", outlet: "Sustainability Today", title: "Better Nature expands to 38 cities with youth-led model", href: "" },
      { date: "2025-11-21", outlet: "Climate Youth Network", title: "The food rescue movement has a new playbook", href: "" },
    ],
    pressLogos: [
      // Just text names — swap with logo files when you have them
      "Memphis Paper", "Sustainability Today", "Climate Youth", "Local News", "Food Tank",
    ],
  },

  // ── EVENTS ────────────────────────────────────────────────────────────
  events: [
    // Replace with real upcoming events. Dates in YYYY-MM-DD format.
    { date: "2026-05-03", time: "9:00 AM", title: "Overton Park Tree Planting", chapter: "Memphis", type: "Evergreen", href: "" },
    { date: "2026-05-10", time: "7:30 AM", title: "Saturday Morning Pickup Run", chapter: "Memphis", type: "IRIS", href: "" },
    { date: "2026-05-17", time: "10:00 AM", title: "Wolf River Cleanup", chapter: "Memphis", type: "Hydro", href: "" },
    { date: "2026-05-24", time: "6:00 PM", title: "New Chapter Leader Orientation", chapter: "National", type: "Community", href: "" },
  ],

  // ── CHAPTERS ──────────────────────────────────────────────────────────
  chapters: {
    eyebrow: "Find your chapter",
    title: "Active in 38 cities. Growing.",
    body: "Don't see your city? Start a chapter. We give you the playbook, the insurance, the partner introductions, and the onboarding — you give us the weekends.",
    featured: [
      {
        city: "Memphis", state: "TN", president: "Satvik Koya", members: 80,
        instagram: "https://instagram.com/betternaturememphis",
        blurb: "Our founding chapter. Weekly pickups across Midtown, East Memphis & Downtown. Monthly Wolf River cleanups.",
        roster: [
          { name: "Satvik Koya", role: "Chapter President", instagram: "https://instagram.com/satvik" },
          { name: "Add member 2", role: "Pickups Lead", instagram: "" },
          { name: "Add member 3", role: "Evergreen Lead", instagram: "" },
          { name: "Add member 4", role: "Hydro Lead", instagram: "" },
          { name: "Add member 5", role: "Outreach", instagram: "" },
        ],
      },
      { city: "Nashville", state: "TN", president: "Add name", members: 42, instagram: "", blurb: "", roster: [] },
      { city: "Atlanta", state: "GA", president: "Add name", members: 56, instagram: "", blurb: "", roster: [] },
      { city: "Austin", state: "TX", president: "Add name", members: 38, instagram: "", blurb: "", roster: [] },
      { city: "Chicago", state: "IL", president: "Add name", members: 64, instagram: "", blurb: "", roster: [] },
      { city: "Brooklyn", state: "NY", president: "Add name", members: 72, instagram: "", blurb: "", roster: [] },
    ],
    totalCities: 38,
    startChapterUrl: "mailto:info@betternatureofficial.org?subject=Start%20a%20chapter",
  },

  // ── PARTNER RESTAURANTS / SPONSORS ────────────────────────────────────
  partners: {
    eyebrow: "Restaurant, grocer & business partners",
    title: "180+ businesses that refuse to waste.",
    body: "Restaurants, cafés, grocers, bakeries, caterers, corporate kitchens, hotels, schools — any business with edible surplus. All pickups are free, scheduled, and tax-deductible under the Bill Emerson Good Samaritan Food Donation Act.",
    // Each partner: name (required). Optional: website, instagram, logo (image URL).
    // If website OR instagram is set, the tile becomes clickable.
    logos: [
      { name: "Add partner 1", website: "", instagram: "", logo: "" },
      { name: "Add partner 2", website: "", instagram: "", logo: "" },
      { name: "Add partner 3", website: "", instagram: "", logo: "" },
      { name: "Add partner 4", website: "", instagram: "", logo: "" },
      { name: "Add partner 5", website: "", instagram: "", logo: "" },
      { name: "Add partner 6", website: "", instagram: "", logo: "" },
      { name: "Add partner 7", website: "", instagram: "", logo: "" },
      { name: "Add partner 8", website: "", instagram: "", logo: "" },
    ],
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
      { amount: "$25", impact: "Fuels one volunteer pickup route for a week" },
      { amount: "$100", impact: "Plants a native tree with 5-year maintenance guarantee" },
      { amount: "$500", impact: "Sponsors an entire chapter's Saturday pickup run" },
      { amount: "$2,500", impact: "Funds a new chapter launch from orientation to first shift" },
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
