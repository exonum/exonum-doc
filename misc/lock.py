#!/usr/bin/env python

# Script allowing to execute one or more linters.
# Runs from the project root directory.
# It is assumed that the HTML pages are already built and are located in $SRC_DIR.

# Copyright 2017 The Exonum Team
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Script that transforms the output of `pip freeze` to contain only dependencies
related to a particular requirements file.

WARNING: Unbelievably hacky.
"""

from __future__ import print_function
import sys, re, subprocess

USAGE = """\
{} <requirements-file>

Transforms the output of `pip freeze` to contain only dependencies
related to a particular requirements file.

Arguments:
  <requirements-file>         Path to the requirements file to process
""".format(sys.argv[0])

# Package name regexp
RE_PACKAGE_NAME = r'^[\w-]+'
# Package name matcher in `pip show` output
RE_INFO_NAME = r'^Name: ([\w-]+)$'
# Package requirements matcher in `pip show` output
RE_INFO_REQS = r'^Requires: (.*)$'
# Comment separating packages automatically included by `pip freeze`
RE_AUTO_REQS_COMMENT = r'^#.*pip freeze'

def log(line):
    sys.stderr.write(line + '\n')
    sys.stderr.flush()

def get_requirements(filename):
    """Parses requirements from a requirments file.
    Returns a list of package names.

    :param filename:    Path to the requirments file
    """

    packages = []

    with open(filename) as f:
        for line in f:
            match = re.match(RE_PACKAGE_NAME, line)
            if match:
                packages.append(match.group(0))

    return packages

def package_info(name):
    """Retrieves information about a package via `pip show`.
    Returns a 2-element tuple, consisting of the canonical package name,
    and a list of its requirements.

    :param name:    Name of the package
    """

    log('Retrieving info for package {}'.format(name))

    output = subprocess.check_output(['pip', 'show', name])
    info = [ None, [] ]
    for line in output.splitlines():
        m_name, m_reqs = re.match(RE_INFO_NAME, line), re.match(RE_INFO_REQS, line)
        if m_name:
            info[0] = m_name.group(1)
        elif m_reqs:
            info[1] = re.split(r'\s*,\s*', m_reqs.group(1))

    if info[0] is None:
        raise Exception('Invalid info returned for package {}'.format(name))
    if info[1] == ['']:
        info[1] = []

    return info

def lock(filename):
    packages = get_requirements(filename)[:]
    package_set = set()

    i = 0
    while i < len(packages):
        name, reqs = package_info(packages[i])
        package_set.add(name)
        packages += [ req for req in reqs if req not in package_set ]
        i += 1

    output = subprocess.check_output(['pip', 'freeze', '-r', filename])
    tr_output = ''
    auto_reqs = False
    for line in output.splitlines():
        if not auto_reqs or line.split('==')[0] in package_set:
            tr_output += line + '\n'

        if re.match(RE_AUTO_REQS_COMMENT, line):
            auto_reqs = True

    # Truncate the last newline
    return tr_output[:-1]

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(USAGE); sys.exit(1)

    log('Processing {}'.format(sys.argv[1]))
    print(lock(sys.argv[1]))
