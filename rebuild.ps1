git.exe clean -d  -fx
del .\package-lock.json
node -v
npm -v
npm install --arch=x64
npm run configure
.\node_modules\.bin\electron-rebuild.cmd
robocopy .\build\release .\minkowski\Release\ *.* /E
npm run start
