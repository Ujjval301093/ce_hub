from setuptools import setup, find_packages

with open("requirements.txt") as f:
	install_requires = f.read().strip().split("\n")

from ce_hub import __version__ as version

setup(
	name="ce_hub",
	version=version,
	description="C&E Employee Hub",
	author="C and E Consultancy Private Limited",
	author_email="info@candeconsultancy.com",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires
)
