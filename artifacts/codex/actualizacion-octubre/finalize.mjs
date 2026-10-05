import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const directory=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const skill='C:/Users/Pc/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const source=JSON.parse(await fs.readFile(path.join(directory,'build/merge-verification.json'),'utf8')).source;
await fs.mkdir(path.join(directory,'entrega'),{recursive:true});
const result=await finalizePresentation({
  workspaceDir:directory,
  candidatePath:path.join(directory,'build/combined-candidate.pptx'),
  finalPath:path.join(directory,'entrega/Logistica-actualizada-1-3-octubre-2026.pptx'),
  pythonExecutable:'C:/Users/Pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
  integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],
  fontPolicy:{basis:'reference',families:['IBM Plex Sans'],referencePath:source,referenceSha256:crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex')},
  verifyArtifactToolImport:true,
  receiptPath:path.join(directory,'build/final-validation.json'),
});
console.log(JSON.stringify(result));
