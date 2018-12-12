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

const to = promise => promise.then(data => [data, null]).catch(err => [null, { err }])

const generateVersionedDocs = async (versions) => {
  await cleanUp()

  const git = new Git({})
  const returnToBranch = await git.getBranchName()

  fs.mkdirSync('./version')
  let failed = 0
  for (let version of versions) {
    const [, error] = await to(git.checkout(version))
    if (error) {
      console.error(`Checkout failed. Tag ${version} is not built.`)
      failed++
      continue
    }
    const versionedMkdocs = YAML.load('mkdocs.yml')
    const configFile = `./version/${version}.yml`
    versionedMkdocs.extra.versions = versions
    fs.writeFileSync(`./version/${version}.yml`, YAML.stringify(versionedMkdocs, 7), 'utf8')
    await mkdocsBuild(`./version/${version}`, configFile)
    await git.checkout(returnToBranch)
  }

  return { failed, success: versions.length - failed }
}

const versionsList = fs.readFileSync('./versions.txt', 'utf-8')
  .split(/\r\n|\r|\n/)
  .filter(item => item !== '')

generateVersionedDocs(versionsList)
  .then(data => console.info(`Documentation built: ${data.success} versions success, ${data.failed} failed.`))
  .catch(e => console.error('[ERROR]', e))
