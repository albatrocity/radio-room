module.exports = {
  siteMetadata: {
    title: `Snacky Vol 2`,
    description: `A synth and drum project`,
    author: `@albatrocity`,
  },
  plugins: [
    `gatsby-plugin-react-helmet`,
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `images`,
        path: `${__dirname}/src/images`,
      },
    },
    `gatsby-transformer-sharp`,
    `gatsby-plugin-sharp`,
    {
      resolve: `gatsby-plugin-manifest`,
      options: {
        name: `Snacky Vol 2`,
        short_name: `Snacky`,
        start_url: `/`,
        background_color: `#fff`,
        theme_color: `#bf0111`,
        display: `minimal-ui`,
        icon: `src/images/icon.jpg`,
      },
    },
    {
      resolve: `gatsby-plugin-google-fonts`,
      options: {
        fonts: [`Fredoka+One`, `Maven+Pro:400,400i,700`],
        display: "swap",
      },
    },
    {
      resolve: `gatsby-plugin-styled-components`,
    },
    // this (optional) plugin enables Progressive Web App + Offline functionality
    // To learn more, visit: https://gatsby.dev/offline
    // `gatsby-plugin-offline`,
  ],
}
