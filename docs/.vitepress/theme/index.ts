import DefaultTheme from "vitepress/theme";
import Mermaid from "./Mermaid.vue";
import ArchifyEmbed from "./ArchifyEmbed.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("Mermaid", Mermaid);
    app.component("ArchifyEmbed", ArchifyEmbed);
  }
};
