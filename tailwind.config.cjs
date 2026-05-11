module.exports = {
  content: ["./public/index.html", "./public/site.js"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Geist", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        linear: {
          black: "#0A0A0A",
          card: "rgba(13,13,13,0.7)",
          blue: "#007AFF",
          purple: "#8B5CF6"
        }
      },
      boxShadow: {
        linear: "0 32px 120px -56px rgba(0,122,255,0.58), 0 18px 54px -42px rgba(0,0,0,0.9)"
      }
    }
  },
  plugins: []
};
