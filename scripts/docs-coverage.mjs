export function findMissingPackageDocs(packages, documentedPackageDirectories) {
  const documented = new Set(documentedPackageDirectories)
  return packages
    .filter((pkg) => pkg.publishable && pkg.private !== true && !documented.has(pkg.directory))
    .map((pkg) => `${pkg.name} (expected docs/packages/${pkg.directory}.md)`)
}

export function findUnexpectedPackageDocs(packages, documentedPackageDirectories) {
  const publishable = new Set(packages.filter((pkg) => pkg.publishable && pkg.private !== true).map((pkg) => pkg.directory))
  return documentedPackageDirectories
    .filter((directory) => !publishable.has(directory))
    .map((directory) => `docs/packages/${directory}.md (package is private or not publishable)`)
}
