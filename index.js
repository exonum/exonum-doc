const { Git } = require('git-interface')
const { exec } = require('shelljs')
const YAML = require('yamljs')
const fs = require('fs')
const path = require('path')

const sitePath = path.join(__dirname, '/site')
const BUILD_COMMAND = 'mkdocs build'
const CLEANUP_COMMAND = 'rm -rf ./version'

const mkdocsBuild = (path, configFile) => asyncExec(`${BUILD_COMMAND} -d ${path} -f ${configFile}`)
const cleanUp = () => asyncExec(CLEANUP_COMMAND)

const asyncExec = command => new Promise((resolve, reject) =>
  exec(command, (code, stdout, stderr) => code === 0 ? resolve(stdout) : reject(stderr)))

const generateVersionedDocs = async (versions, mkdocs) => {
  await cleanUp()

  const git = new Git({})
  const returnToBranch = await git.getBranchName()

  fs.mkdirSync('./version')
  for (let version of versions) {
    await git.checkout(version.id).catch(() => {throw 'Checkout failed, stash or commit changes'})
    const versionedMkdocs = YAML.load('mkdocs.yml')
    const configFile = `./version/${version.id}.yml`
    versionedMkdocs.extra.versions = mkdocs.extra.versions
    fs.writeFileSync(`./version/${version.id}.yml`, YAML.stringify(versionedMkdocs, 7), 'utf8')
    await mkdocsBuild(`./version/${version.name}`, configFile)
    await git.checkout(returnToBranch)
  }

  return versions
}

const mkdocs = YAML.load('mkdocs.yml')
const { extra: { versions } } = mkdocs
generateVersionedDocs(versions, mkdocs)
  .then(versions => console.info(`${versions.length} versions of documentation successfully builded`))
  .catch(e => console.error('[ERROR]', e))
