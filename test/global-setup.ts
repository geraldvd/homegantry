import { buildKnowledgeBase } from '../scripts/kb-lib.js';

/** The server reads the generated knowledge base, so every test run starts from the YAML files. */
export default function setup(): void {
  buildKnowledgeBase();
}
