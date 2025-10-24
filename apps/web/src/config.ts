export const SITE = {
  website: "https://hamlet-hamtramck.pages.dev/", // replace this with your deployed domain
  author: "Hamlet Hamtramck",
  profile: "https://hamlet-hamtramck.pages.dev/",
  desc: "A minimal, responsive and SEO-friendly Astro blog.",
  title: "Hamlet Hamtramck",
  ogImage: "astropaper-og.jpg",
  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 4,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true, // show back button in post detail
  editPost: {
    enabled: false,
    text: "Edit page",
    url: "",
  },
  dynamicOgImage: true,
  dir: "ltr", // "rtl" | "auto"
  lang: "en", // html lang code. Set this empty and default will be "en"
  timezone: "America/Detroit", // Default global timezone (IANA format) https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
} as const;
