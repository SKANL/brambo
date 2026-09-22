export function validateDocVersions({versions, tags, tagFiles, snapshots}) {
  const errors = []
  const tagSet = new Set(tags)
  for (const version of versions) {
    if (version === 'Next' || version.toLowerCase() === 'next') {
      errors.push(`Next is an unpublished workspace version and must not appear in docs-site/versions.json`)
      continue
    }
    const tag = `v${version}`
    if (!tagSet.has(tag)) { errors.push(`Missing local release tag ${tag} for docs-site/versions.json entry ${version}`); continue }
    const sourceFiles = tagFiles[version] ?? {}
    const snapshotFiles = snapshots[version] ?? {}
    if (Object.keys(sourceFiles).length === 0) {
      errors.push(`Release tag ${tag} contains no documentation files; refusing an empty snapshot validation`)
      continue
    }
    for (const [sourcePath, content] of Object.entries(sourceFiles)) {
      const snapshotPath = sourcePath.startsWith('docs-site/docs/')
        ? sourcePath.replace('docs-site/docs/', `docs-site/versioned_docs/version-${version}/`)
        : sourcePath.replace('/current/', `/version-${version}/`)
      if (!Object.hasOwn(snapshotFiles, snapshotPath)) errors.push(`Missing snapshot page ${snapshotPath} (from ${tag}:${sourcePath})`)
      else if (Buffer.compare(Buffer.isBuffer(snapshotFiles[snapshotPath]) ? snapshotFiles[snapshotPath] : Buffer.from(snapshotFiles[snapshotPath]), Buffer.isBuffer(content) ? content : Buffer.from(content)) !== 0) {
        errors.push(`Snapshot mismatch ${snapshotPath} does not match ${tag}:${sourcePath}`)
      }
    }
    const expectedPaths = new Set(Object.keys(sourceFiles).map((sourcePath) => sourcePath.startsWith('docs-site/docs/')
      ? sourcePath.replace('docs-site/docs/', `docs-site/versioned_docs/version-${version}/`)
      : sourcePath.replace('/current/', `/version-${version}/`)))
    for (const snapshotPath of Object.keys(snapshotFiles)) if (!expectedPaths.has(snapshotPath)) errors.push(`Unexpected snapshot page ${snapshotPath}; not present at ${tag}`)
  }
  return errors
}
