import { resolve } from 'node:path';

import { findWorkspacePackages } from '@pnpm/find-workspace-packages';

const getAliases = async () => {
  const packages = await findWorkspacePackages(process.cwd());
  return Object.fromEntries(packages.map((pkg) => [pkg.manifest.name, resolve(pkg.dir, 'src', 'exports.ts')]));
};

export { getAliases };
