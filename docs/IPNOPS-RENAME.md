# Ipnops rename, pass C1

The package name changed from @lisgen/body-viewer to @ipnops/body-viewer (package.json, package-lock.json, README imports, the package
test). The package has never been published to npm, so no registry name is affected. Consumers that install it from GitHub and import
"@lisgen/body-viewer" must change the import to "@ipnops/body-viewer" when they move to the next commit or tag; the tag v0.1.0 keeps the
old name. The Apache-2.0 LICENSE and NOTICE are unchanged.

## Kept names

- github.com/livingworlds/lisgen-body-viewer (README install line, package.json repository url): GitHub repository URL; updated in one pass
  after the repository is renamed.
