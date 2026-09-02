import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const ownerName = process.env.GITHUB_REPOSITORY_OWNER;
const isUserOrOrganizationSite =
  repositoryName !== undefined &&
  ownerName !== undefined &&
  repositoryName.toLowerCase() === `${ownerName.toLowerCase()}.github.io`;
const base =
  process.env.GITHUB_ACTIONS === "true" && repositoryName && !isUserOrOrganizationSite
    ? `/${repositoryName}/`
    : "/";

export default defineConfig({
  root: "github-pages",
  base,
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../dist-pages",
    emptyOutDir: true,
  },
});
