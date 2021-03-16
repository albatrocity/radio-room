module.exports = {
  siteMetadata: {
    title: `R.I.Peter`,
    description: `Soft Serve`,
    author: `@ripeter`,
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
        name: `R.I.Peter`,
        short_name: `R.I.Peter`,
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
        fonts: [`Maven+Pro:400,400i,700`],
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
