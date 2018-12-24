'use strict'

window.addEventListener('load', function () {
  var versionSelect = document.getElementById('version-select')
  var regexp = /version\/(.+?)\//
  versionSelect.value = location.pathname.match(regexp)[1]

  versionSelect.addEventListener('change', function () {
    window.location.replace(location.href.replace(regexp, 'version/' + this.value + '/'))
  })
})
