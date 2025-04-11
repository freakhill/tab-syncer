const path = require("path");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "production", // Set the mode to production for optimized builds
  entry: {
    background: "./src/background.js",
    options: "./src/options.js",
    popup: "./src/popup.js",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
  },
  resolve: {
    extensions: [".js"],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
        },
      },
    ],
  },
  plugins: [
    new CleanWebpackPlugin(), // Automatically clean the 'dist' folder before each build
    new CopyWebpackPlugin({
      patterns: [
        { from: "html", to: "" }, // Copy all files from the 'html' folder to the 'dist' folder
        { from: "node_modules/font-awesome/css", to: "css" },
        { from: "node_modules/font-awesome/fonts", to: "fonts" },
      ],
    }),
  ],
};

// Add a build function to clean the dist folder
if (process.env.CLEAN_DIST === "true") {
  const cleanPlugin = new CleanWebpackPlugin();
  cleanPlugin.apply({
    hooks: {
      emit: {
        tap: () => console.log("Cleaning dist folder..."),
      },
    },
  });
}
