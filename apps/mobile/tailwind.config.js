/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        arc: {
          bg: "#0a0a0a",
          primary: "#00f3ff",
          "primary-light": "#008b96",
        },
      },
    },
  },
  plugins: [],
};
