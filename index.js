const { Git } = require('git-interface')
const { exec } = require('shelljs')
const YAML = require('yamljs')
const fs = require('fs')
const path = require('path')

const sitePath = path.join(__dirname, '/site')
const BUILD_COMMAND = 'mkdocs build'
const CLEANUP_COMMAND = 'rm -rf ./version'

const mkdocsBuild = (path) => new Promise((resolve, reject) =>
  exec(`${BUILD_COMMAND} -d ${path}`, (code, stdout, stderr) => code === 0 ? resolve(stdout) : reject(stderr)))

const cleanUp = () => new Promise((resolve, reject) =>
  exec(CLEANUP_COMMAND, (code, stdout, stderr) => code === 0 ? resolve(stdout) : reject(stderr)))

const generateVersionedDocs = async (versions) => {
  await cleanUp()

  const git = new Git({})
  const returnToBranch = await git.getBranchName()

  fs.mkdirSync('./version')
  for (let version of versions) {
    await git.checkout(version.id).catch(() => {throw 'Checkout failed, stash or commit changes'})
    await mkdocsBuild(`./version/${version.name}`)
  }
  await git.checkout(returnToBranch)

  return versions
}

const mkdocs = YAML.load('mkdocs.yml')
const { extra: { versions } } = mkdocs
generateVersionedDocs(versions)
  .then(versions => console.info(`${versions.length} versions of documentation successfully builded`))
  .catch(e => console.error('[ERROR]', e))
