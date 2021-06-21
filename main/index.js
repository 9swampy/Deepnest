'use strict';

// UI-specific stuff in this script
function ready(fn) {
    if (document.readyState != 'loading') {
        fn();
    }
    else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}

const uuidV4 = require('uuid');
const { ipcRenderer } = require('electron');
const fs = require('graceful-fs');
const request = require('request');
const http = require('http');
const path = require('path');
const { exec } = require("child_process");

ready(function () {
    // main navigation			
    var tabs = document.querySelectorAll('#sidenav li');

    Array.from(tabs).forEach(tab => {
        tab.addEventListener('click', function (e) {
            if (this.className == 'active' || this.className == 'disabled') {
                return false;
            }

            var activetab = document.querySelector('#sidenav li.active');
            activetab.className = '';

            var activepage = document.querySelector('.page.active');
            activepage.className = 'page';

            this.className = 'active';
            var tabpage = document.querySelector('#' + this.dataset.page);
            tabpage.className = 'page active';

            if (tabpage.getAttribute('id') == 'home') {
                resize();
            }
            return false;
        });
    });

    // config form
    const config = require('electron-settings');
    window.config = config;

    var defaultconfig = {
        units: 'inch',
        scale: 72, // actual stored value will be in units/inch
        spacing: 0,
        curveTolerance: 0.72, // store distances in native units
        rotations: 4,
        threads: 4,
        populationSize: 10,
        mutationRate: 10,
        placementType: 'box', // how to place each part (possible values gravity, box, convexhull)
        mergeLines: true, // whether to merge lines
        timeRatio: 0.5, // ratio of material reduction to laser time. 0 = optimize material only, 1 = optimize laser time only
        simplify: false,
        useConverterDeepnestIo: false,
        dxfImportScale: "1",
        dxfExportScale: "72",
        endpointTolerance: 0.36,
        conversionServer: 'http://convert.deepnest.io',
        kabejaPath: 'D:/kabeja-0.4'
    };

    config.defaults(defaultconfig);

    const defaultConversionServer = 'http://convert.deepnest.io';
    const defaultKabejaPath = 'D:/kabeja-0.4';

    // set to default if not set (for people with old configs stored)
    for (var key in defaultconfig) {
        if (typeof config.getSync(key) === 'undefined') {
            config.setSync(key, defaultconfig[key]);
        }
    }

    config.get().then(val => {
        window.DeepNest.config(val);
        updateForm(val);
    });

    var inputs = document.querySelectorAll('#config input, #config select');

    Array.from(inputs).forEach(i => {
        i.addEventListener('change', function (e) {

            var val = i.value;
            var key = i.getAttribute('data-config');

            if (key == 'scale') {
                if (config.getSync('units') == 'mm') {
                    val *= 25.4; // store scale config in inches
                }
            }

            if (key == 'mergeLines' || key == 'simplify' || key == 'useConverterDeepnestIo') {
                val = i.checked;
            }

            if (i.getAttribute('data-conversion') == 'true') {
                // convert real units to svg units
                var conversion = config.getSync('scale');
                if (config.getSync('units') == 'mm') {
                    conversion /= 25.4;
                }
                val *= conversion;
            }

            // add a spinner during saving to indicate activity
            i.parentNode.className = 'progress';

            config.set(key, val).then(() => {
                config.get().then(val => {
                    window.DeepNest.config(val);
                    updateForm(val);

                    i.parentNode.className = '';

                    if (key == 'units') {
                        ractive.update('getUnits');
                        ractive.update('dimensionLabel');
                    }
                });
            });
        });
    });

    var setdefault = document.querySelector('#setdefault');
    setdefault.onclick = function (e) {
        // don't reset user profile
        var tempaccess = config.getSync('access_token');
        var tempid = config.getSync('id_token');
        config.resetToDefaultsSync();
        config.setSync('access_token', tempaccess);
        config.setSync('id_token', tempid);
        config.get().then(val => {
            window.DeepNest.config(val);
            updateForm(val);
        });
        return false;
    }

    function updateForm(c) {
        var unitinput
        if (c.units == 'inch') {
            unitinput = document.querySelector('#configform input[value=inch]');
        }
        else {
            unitinput = document.querySelector('#configform input[value=mm]');
        }

        unitinput.checked = true;

        var labels = document.querySelectorAll('span.unit-label');
        Array.from(labels).forEach(l => {
            l.innerText = c.units;
        });

        var scale = document.querySelector('#inputscale');
        if (c.units == 'inch') {
            scale.value = c.scale;
        }
        else {
            // mm
            scale.value = c.scale / 25.4;
        }

        /*var scaledinputs = document.querySelectorAll('[data-conversion]');
        Array.from(scaledinputs).forEach(si => {
            si.value = c[si.getAttribute('data-config')]/scale.value;
        });*/

        var inputs = document.querySelectorAll('#config input, #config select');
        Array.from(inputs).forEach(i => {
            var key = i.getAttribute('data-config');
            if (key == 'units' || key == 'scale') {
                return;
            }
            else if (i.getAttribute('data-conversion') == 'true') {
                i.value = c[i.getAttribute('data-config')] / scale.value;
            }
            else if (key == 'mergeLines' || key == 'simplify' || key == 'useConverterDeepnestIo') {
                i.checked = c[i.getAttribute('data-config')];
            }
            else {
                i.value = c[i.getAttribute('data-config')];
            }
        });
    }

    document.querySelectorAll('#config input, #config select').forEach(function (e) {
        e.onmouseover = function (event) {
            var inputid = e.getAttribute('data-config');
            if (inputid) {
                document.querySelectorAll('.config_explain').forEach(function (el) {
                    el.className = 'config_explain';
                });

                var selected = document.querySelector('#explain_' + inputid);
                if (selected) {
                    selected.className = 'config_explain active';
                }
            }
        }

        e.onmouseleave = function (event) {
            document.querySelectorAll('.config_explain').forEach(function (el) {
                el.className = 'config_explain';
            });
        }
    });

    // add spinner element to each form dd
    var dd = document.querySelectorAll('#configform dd');
    Array.from(dd).forEach(d => {
        var spinner = document.createElement("div");
        spinner.className = 'spinner';
        d.appendChild(spinner);
    });

    // version info
    var pjson = require('../package.json');
    var version = document.querySelector('#package-version');
    version.innerText = pjson.version;

    // part view
    Ractive.DEBUG = false

    var label = Ractive.extend({
        template: '{{label}}',
        computed: {
            label: function () {
                var width = this.get('bounds').width;
                var height = this.get('bounds').height;
                var units = config.getSync('units');
                var conversion = config.getSync('scale');

                // trigger computed dependency chain
                this.get('getUnits');

                if (units == 'mm') {
                    return (25.4 * (width / conversion)).toFixed(1) + 'mm x ' + (25.4 * (height / conversion)).toFixed(1) + 'mm';
                }
                else {
                    return (width / conversion).toFixed(1) + 'in x ' + (height / conversion).toFixed(1) + 'in';
                }
            }
        }
    });

    var ractive = new Ractive({
        el: '#homecontent',
        //magic: true,
        template: '#template-part-list',
        data: {
            parts: DeepNest.parts,
            imports: DeepNest.imports,
            getSelected: function () {
                var parts = this.get('parts');
                return parts.filter(function (p) {
                    return p.selected;
                });
            },
            getSheets: function () {
                var parts = this.get('parts');
                return parts.filter(function (p) {
                    return p.sheet;
                });
            },
            serializeSvg: function (svg) {
                return (new XMLSerializer()).serializeToString(svg);
            },
            partrenderer: function (part) {
                var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', (part.bounds.width + 10) + 'px');
                svg.setAttribute('height', (part.bounds.height + 10) + 'px');
                svg.setAttribute('viewBox', (part.bounds.x - 5) + ' ' + (part.bounds.y - 5) + ' ' + (part.bounds.width + 10) + ' ' + (part.bounds.height + 10));

                part.svgelements.forEach(function (e) {
                    svg.appendChild(e.cloneNode(false));
                });
                return (new XMLSerializer()).serializeToString(svg);
            }
        },
        computed: {
            getUnits: function () {
                var units = config.getSync('units');
                if (units == 'mm') {
                    return 'mm';
                }
                else {
                    return 'in';
                }
            }
        },
        components: { dimensionLabel: label }
    });

    var mousedown = 0;
    document.body.onmousedown = function () {
        mousedown = 1;
    }
    document.body.onmouseup = function () {
        mousedown = 0;
    }

    var update = function () {
        ractive.update('imports');
        applyzoom();
    }

    var throttledupdate = throttle(update, 500);

    var togglepart = function (part) {
        if (part.selected) {
            part.selected = false;
            for (var i = 0; i < part.svgelements.length; i++) {
                part.svgelements[i].removeAttribute('class');
            }
        }
        else {
            part.selected = true;
            for (var i = 0; i < part.svgelements.length; i++) {
                part.svgelements[i].setAttribute('class', 'active');
            }
        }
    }

    ractive.on('selecthandler', function (e, part) {
        if (e.original.target.nodeName == 'INPUT') {
            return true;
        }
        if (mousedown > 0 || e.original.type == 'mousedown') {
            togglepart(part);

            ractive.update('parts');
            throttledupdate();
        }
    });

    ractive.on('selectall', function (e) {
        var selected = DeepNest.parts.filter(function (p) {
            return p.selected;
        }).length;

        var toggleon = (selected < DeepNest.parts.length);

        DeepNest.parts.forEach(function (p) {
            if (p.selected != toggleon) {
                togglepart(p);
            }
            p.selected = toggleon;
        });

        ractive.update('parts');
        ractive.update('imports');

        if (DeepNest.imports.length > 0) {
            applyzoom();
        }
    });

    // applies svg zoom library to the currently visible import
    var applyzoom = function () {
        if (DeepNest.imports.length > 0) {
            for (var i = 0; i < DeepNest.imports.length; i++) {
                if (DeepNest.imports[i].selected) {
                    if (DeepNest.imports[i].zoom) {
                        var pan = DeepNest.imports[i].zoom.getPan();
                        var zoom = DeepNest.imports[i].zoom.getZoom();
                    }
                    else {
                        var pan = false;
                        var zoom = false;
                    }
                    DeepNest.imports[i].zoom = svgPanZoom('#import-' + i + ' svg', {
                        zoomEnabled: true,
                        controlIconsEnabled: false,
                        fit: true,
                        center: true,
                        maxZoom: 50,
                        minZoom: 0.1
                    });

                    if (zoom) {
                        DeepNest.imports[i].zoom.zoom(zoom);
                    }
                    if (pan) {
                        DeepNest.imports[i].zoom.pan(pan);
                    }

                    document.querySelector('#import-' + i + ' .zoomin').addEventListener('click', function (ev) {
                        ev.preventDefault();
                        DeepNest.imports.find(function (e) {
                            return e.selected;
                        }).zoom.zoomIn();
                    });
                    document.querySelector('#import-' + i + ' .zoomout').addEventListener('click', function (ev) {
                        ev.preventDefault();
                        DeepNest.imports.find(function (e) {
                            return e.selected;
                        }).zoom.zoomOut();
                    });
                    document.querySelector('#import-' + i + ' .zoomreset').addEventListener('click', function (ev) {
                        ev.preventDefault();
                        DeepNest.imports.find(function (e) {
                            return e.selected;
                        }).zoom.resetZoom().resetPan();
                    });
                }
            }
        }
    };

    ractive.on('importselecthandler', function (e, im) {
        if (im.selected) {
            return false;
        }

        DeepNest.imports.forEach(function (i) {
            i.selected = false;
        });

        im.selected = true;
        ractive.update('imports');
        applyzoom();
    });

    ractive.on('importdelete', function (e, im) {
        var index = DeepNest.imports.indexOf(im);
        DeepNest.imports.splice(index, 1);

        if (DeepNest.imports.length > 0) {
            if (!DeepNest.imports[index]) {
                index = 0;
            }

            DeepNest.imports[index].selected = true;
        }


        ractive.update('imports');

        if (DeepNest.imports.length > 0) {
            applyzoom();
        }
    });

    var deleteparts = function (e) {
        for (var i = 0; i < DeepNest.parts.length; i++) {
            if (DeepNest.parts[i].selected) {
                for (var j = 0; j < DeepNest.parts[i].svgelements.length; j++) {
                    var node = DeepNest.parts[i].svgelements[j];
                    if (node.parentNode) {
                        node.parentNode.removeChild(node);
                    }
                }
                DeepNest.parts.splice(i, 1);
                i--;
            }
        }

        ractive.update('parts');
        ractive.update('imports');

        if (DeepNest.imports.length > 0) {
            applyzoom();
        }

        resize();
    }

    ractive.on('delete', deleteparts);
    document.body.addEventListener('keydown', function (e) {
        if (e.keyCode == 8 || e.keyCode == 46) {
            deleteparts();
        }
    });

    // sort table
    var attachSort = function () {
        var headers = document.querySelectorAll('#parts table thead th');
        Array.from(headers).forEach(header => {
            header.addEventListener('click', function (e) {
                var sortfield = header.getAttribute('data-sort-field');

                if (!sortfield) {
                    return false;
                }

                var reverse = false;
                if (this.className == 'asc') {
                    reverse = true;
                }

                DeepNest.parts.sort(function (a, b) {
                    var av = a[sortfield];
                    var bv = b[sortfield];
                    if (av < bv) {
                        return reverse ? 1 : -1;
                    }
                    if (av > bv) {
                        return reverse ? -1 : 1;
                    }
                    return 0;
                });

                Array.from(headers).forEach(h => {
                    h.className = '';
                });

                if (reverse) {
                    this.className = 'desc';
                }
                else {
                    this.className = 'asc';
                }

                ractive.update('parts');
            });
        });
    }

    // file import
    var electron = require('electron');
    var app = electron.remote;
    var fs = require('fs');

    var importbutton = document.querySelector('#import');
    importbutton.onclick = function () {
        if (importbutton.className == 'button import disabled' || importbutton.className == 'button import spinner') {
            console.log("Import disabled or spinning. . .");
            return false;
        }

        importbutton.className = 'button import disabled';

        setTimeout(function () {
            //const { dialog } = require('electron').remote;
            var dialog = app.dialog;
            console.log("Import show dialog");
            dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [
                    { name: 'CAD formats', extensions: ['svg', 'dxf', 'cdr'] }
                ]
            }).then(result => {
                console.log("Handle showOpenDialog:");
                if (result === undefined || result.canceled || result.filePaths === undefined) {
                    importbutton.className = 'button import';
                    console.log("No file selected.");
                }
                else {
                    console.log("Import result=", result);
                    var ext = path.extname(result.filePaths[0]);
                    var filename = path.basename(result.filePaths[0]);
                    var fullFilename = result.filePaths[0];
                    console.log("Import ", fullFilename);

                    if (ext.toLowerCase() == '.svg') {
                        readFile(fullFilename);
                        importbutton.className = 'button import';
                    }
                    else if (ext.toLowerCase() == '.dxf' && !config.getSync('useConverterDeepnestIo')) {
                        importbutton.className = 'button import spinner';
                        var filenameSvg = `${path.basename(result.filePaths[0], ext)}${uuidV4()}.svg`;
                        var kabejaPath = config.getSync('kabejaPath');
                        if (!kabejaPath) {
                            kabejaPath = defaultKabejaPath;
                        }

                        console.log("kabejaPath=", kabejaPath);
                        var command = `java -jar ${kabejaPath}/launcher.jar -nogui -pipeline svg ${fullFilename} ${kabejaPath}/${filenameSvg}`;
                        console.log(command);
                        exec(command, { cwd: kabejaPath }, (error, stdout) => {
                            if (error) {
                                console.log("Kabeja error:", error.message);
                                importbutton.className = 'button import';
                                return;
                            }

                            console.log("data", stdout)

                            // dirpath is used for loading images embedded in svg files
                            // converted svgs will not have images
                            console.log(`ReadFileSync ${kabejaPath}/${filenameSvg}`);
                            var svgBody = fs.readFileSync(`${kabejaPath}/${filenameSvg}`, "utf8");
                            console.log(svgBody);
                            loadKabejaDxfTranslation(svgBody, fullFilename);

                            command = `del ${kabejaPath}/${filenameSvg}`;
                            command = command.replace(/[//]/g, '\\');
                            console.log(command);
                            exec(command, { cwd: kabejaPath }, (error, stdout) => {
                                if (error) {
                                    console.log("Kabeja error:", error.message);
                                    importbutton.className = 'button import';
                                    return;
                                }

                                console.log("data", stdout);
                                importbutton.className = 'button import';
                            });
                        });
                    }
                    else {
                        importbutton.className = 'button import spinner';

                        // send to conversion server
                        var url = config.getSync('conversionServer');
                        if (!url) {
                            url = defaultConversionServer;
                        }
                        console.log("conversionServer=", url);

                        var req = request.post(url, function (err, resp, body) {
                            importbutton.className = 'button import';
                            if (err) {
                                message(`Conversion server error ${err}`, true);
                                console.log(err);
                                console.log('Could not contact file conversion server');
                                console.log(resp);
                                console.log(body);
                            } else {
                                console.log("Response received from service.");
                                console.log(resp);
                                console.log(body);
                                if (body.substring(0, 5) == 'error') {
                                    message(body, true);
                                }
                                else {
                                    loadKabejaDxfTranslation(body, fullFilename);
                                }
                            }
                        });

                        var form = req.form();
                        form.append('format', 'svg');
                        form.append('fileUpload', fs.createReadStream(fullFilename));
                        //console.log(req);
                        //console.log(form);
                    }
                }
            }).catch(err => console.log('Handle Error', err));
            console.log("Import dialog should have opened; callback will handle submission.");
        }, 50);

    };

    function loadKabejaDxfTranslation(body, fullFilename) {
        // expected input dimensions on server is points
        // scale based on unit preferences
        var con = null;
        var dxfFlag = false;
        if (path.extname(fullFilename).toLowerCase() == '.dxf') {
            //var unit = config.getSync('units');
            con = Number(config.getSync('dxfImportScale'));
            dxfFlag = true;
            console.log('dxfImportScale=', con);

            /*if(unit == 'inch'){
                con = 72;
            }
            else{
                // mm
                con = 2.83465;
            }*/
        }

        // dirpath is used for loading images embedded in svg files
        // converted svgs will not have images
        console.log(fullFilename, body);
        importData(body, fullFilename, null, con, dxfFlag);
    }

    function readFile(filepath) {
        fs.readFile(filepath, 'utf-8', function (err, data) {
            if (err) {
                message("An error ocurred reading the file :" + err.message, true);
                return;
            }
            var filename = path.basename(filepath);
            var dirpath = path.dirname(filepath);

            importData(data, filename, dirpath, null);
        });
    };

    function importData(data, filename, dirpath, scalingFactor, dxfFlag) {
        window.DeepNest.importsvg(filename, dirpath, data, scalingFactor, dxfFlag);

        DeepNest.imports.forEach(function (im) {
            im.selected = false;
        });

        DeepNest.imports[DeepNest.imports.length - 1].selected = true;

        ractive.update('imports');
        ractive.update('parts');

        attachSort();
        applyzoom();
        resize();
    }

    // part list resize
    var resize = function (event) {
        var parts = document.querySelector('#parts');
        var table = document.querySelector('#parts table');

        if (event) {
            parts.style.width = event.rect.width + 'px';
        }

        var home = document.querySelector('#home');

        var imports = document.querySelector('#imports');
        imports.style.width = home.offsetWidth - (parts.offsetWidth - 2) + 'px';
        imports.style.left = (parts.offsetWidth - 2) + 'px';

        var headers = document.querySelectorAll('#parts table th');
        Array.from(headers).forEach(th => {
            var span = th.querySelector('span');
            if (span) {
                span.style.width = th.offsetWidth + 'px';
            }
        });
    }

    interact('.parts-drag')
        .resizable({
            preserveAspectRatio: false,
            edges: { left: false, right: true, bottom: false, top: false }
        })
        .on('resizemove', resize);

    window.addEventListener('resize', function () {
        resize();
    });

    resize();

    // close message
    var messageclose = document.querySelector('#message a.close');
    messageclose.onclick = function () {
        document.querySelector('#messagewrapper').className = '';
        return false;
    };

    // add rectangle
    document.querySelector('#addrectangle').onclick = function () {
        var tools = document.querySelector('#partstools');
        var dialog = document.querySelector('#rectangledialog');

        tools.className = 'active';
    };

    document.querySelector('#cancelrectangle').onclick = function () {
        document.querySelector('#partstools').className = '';
    };

    document.querySelector('#confirmrectangle').onclick = function () {
        var width = document.querySelector('#rectanglewidth');
        var height = document.querySelector('#rectangleheight');

        if (Number(width.value) <= 0) {
            width.className = 'error';
            return false;
        }
        width.className = '';
        if (Number(height.value) <= 0) {
            height.className = 'error';
            return false;
        }

        var units = config.getSync('units');
        var conversion = config.getSync('scale');

        // remember, scale is stored in units/inch
        if (units == 'mm') {
            conversion /= 25.4;
        }

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', 0);
        rect.setAttribute('y', 0);
        rect.setAttribute('width', width.value * conversion);
        rect.setAttribute('height', height.value * conversion);
        svg.appendChild(rect);
        DeepNest.importsvg(null, null, (new XMLSerializer()).serializeToString(svg));

        width.className = '';
        height.className = '';
        width.value = '';
        height.value = '';

        document.querySelector('#partstools').className = '';

        ractive.update('parts');
        resize();
    };

    //var remote = require('remote');
    //var windowManager = app.require('electron-window-manager');

    /*const BrowserWindow = app.BrowserWindow;
    
    const path = require('path');
    const url = require('url');*/



    /*window.nestwindow = windowManager.createNew('nestwindow', 'Windows #2');
    nestwindow.loadURL('./main/nest.html');
    nestwindow.setAlwaysOnTop(true);
    nestwindow.open();*/

    //const remote = require('electron').remote;

    /*window.nestwindow = new BrowserWindow({width: window.outerWidth*0.8, height: window.outerHeight*0.8, frame: true});
    
    nestwindow.loadURL(url.format({
        pathname: path.join(__dirname, './nest.html'),
        protocol: 'file:',
        slashes: true
      }));
    nestwindow.setAlwaysOnTop(true);
    nestwindow.webContents.openDevTools();
    nestwindow.parts = {wat: 'wat'};
    
    console.log(electron.ipcRenderer.sendSync('synchronous-message', 'ping'));*/

    // clear cache
    var deleteCache = function () {
        var path = './nfpcache';
        if (fs.existsSync(path)) {
            fs.readdirSync(path).forEach(function (file, index) {
                var curPath = path + "/" + file;
                if (fs.lstatSync(curPath).isDirectory()) { // recurse
                    deleteFolderRecursive(curPath);
                } else { // delete file
                    fs.unlinkSync(curPath);
                }
            });
            //fs.rmdirSync(path);
        }
    };

    var startnest = function () {
        /*function toClipperCoordinates(polygon){
            var clone = [];
            for(var i=0; i<polygon.length; i++){
                clone.push({
                    X: polygon[i].x*10000000,
                    Y: polygon[i].y*10000000
                });
            }
    
            return clone;
        };
        
        function toNestCoordinates(polygon, scale){
            var clone = [];
            for(var i=0; i<polygon.length; i++){
                clone.push({
                    x: polygon[i].X/scale,
                    y: polygon[i].Y/scale
                });
            }
    
            return clone;
        };
        
        
        var Ac = toClipperCoordinates(DeepNest.parts[0].polygontree);
        var Bc = toClipperCoordinates(DeepNest.parts[1].polygontree);
        for(var i=0; i<Bc.length; i++){
            Bc[i].X *= -1;
            Bc[i].Y *= -1;
        }
        var solution = ClipperLib.Clipper.MinkowskiSum(Ac, Bc, true);
        //console.log(solution.length, solution);
        
        var clipperNfp = toNestCoordinates(solution[0], 10000000);
        for(i=0; i<clipperNfp.length; i++){
            clipperNfp[i].x += DeepNest.parts[1].polygontree[0].x;
            clipperNfp[i].y += DeepNest.parts[1].polygontree[0].y;
        }
        //console.log(solution);
        cpoly = clipperNfp;
        
        //cpoly =  .calculateNFP({A: DeepNest.parts[0].polygontree, B: DeepNest.parts[1].polygontree}).pop();
        gpoly =  GeometryUtil.noFitPolygon(DeepNest.parts[0].polygontree, DeepNest.parts[1].polygontree, false, false).pop();
        
        var svg = DeepNest.imports[0].svg;
        var polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        var polyline2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        
        for(var i=0; i<cpoly.length; i++){
            var p = svg.createSVGPoint();
            p.x = cpoly[i].x;
            p.y = cpoly[i].y;
            polyline.points.appendItem(p);
        }
        for(i=0; i<gpoly.length; i++){
            var p = svg.createSVGPoint();
            p.x = gpoly[i].x;
            p.y = gpoly[i].y;
            polyline2.points.appendItem(p);
        }
        polyline.setAttribute('class', 'active');
        svg.appendChild(polyline);
        svg.appendChild(polyline2);
        
        ractive.update('imports');
        applyzoom();
        
        return false;*/


        for (var i = 0; i < DeepNest.parts.length; i++) {
            if (DeepNest.parts[i].sheet) {
                // need at least one sheet
                document.querySelector('#main').className = '';
                document.querySelector('#nest').className = 'active';

                var displayCallback = function () {
                    // render latest nest if none are selected
                    var selected = this.DeepNest.nests.filter(function (n) {
                        return n.selected;
                    });

                    // only change focus if latest nest is selected
                    if (selected.length == 0 || (this.DeepNest.nests.length > 1 && this.DeepNest.nests[1].selected)) {
                        this.DeepNest.nests.forEach(function (n) {
                            n.selected = false;
                        });
                        displayNest(this.DeepNest.nests[0]);
                        this.DeepNest.nests[0].selected = true;
                    }

                    this.nest.update('nests');

                    // enable export button
                    document.querySelector('#export_wrapper').className = 'active';
                    document.querySelector('#export').className = 'button export';
                }

                deleteCache();

                DeepNest.start(null, displayCallback.bind(window));
                return;
            }
        }

        if (DeepNest.parts.length == 0) {
            message("Please import some parts first");
        }
        else {
            message("Please mark at least one part as the sheet");
        }
    }

    document.querySelector('#startnest').onclick = startnest;

    var stop = document.querySelector('#stopnest');
    stop.onclick = function (e) {
        if (stop.className == 'button stop') {
            ipcRenderer.send('background-stop');
            DeepNest.stop();
            document.querySelectorAll('li.progress').forEach(function (p) {
                p.removeAttribute('id');
                p.className = 'progress';
            });
            stop.className = 'button stop disabled';
            setTimeout(function () {
                stop.className = 'button start';
                stop.innerHTML = 'Start nest';
            }, 3000);
        }
        else if (stop.className == 'button start') {
            stop.className = 'button stop disabled';
            setTimeout(function () {
                stop.className = 'button stop';
                stop.innerHTML = 'Stop nest';
            }, 1000);
            startnest();
        }
    }

    var back = document.querySelector('#back');
    back.onclick = function (e) {

        setTimeout(function () {
            if (DeepNest.working) {
                ipcRenderer.send('background-stop');
                DeepNest.stop();
                document.querySelectorAll('li.progress').forEach(function (p) {
                    p.removeAttribute('id');
                    p.className = 'progress';
                });
            }
            DeepNest.reset();
            deleteCache();

            window.nest.update('nests');
            document.querySelector('#nestdisplay').innerHTML = '';
            stop.className = 'button stop';
            stop.innerHTML = 'Stop nest';

            // disable export button
            document.querySelector('#export_wrapper').className = '';
            document.querySelector('#export').className = 'button export disabled';

        }, 2000);

        document.querySelector('#main').className = 'active';
        document.querySelector('#nest').className = '';
    }

    var exportbutton = document.querySelector('#export');

    var exportsvg = document.querySelector('#exportsvg');
    exportsvg.onclick = function () {

        var dialog = app.dialog;
        dialog.showSaveDialog({ title: 'Export Deepnest SVG' }, function (fileName) {
            if (fileName === undefined) {
                console.log("No file selected");
            }
            else {
                var selected = DeepNest.nests.filter(function (n) {
                    return n.selected;
                });

                if (selected.length == 0) {
                    return false;
                }

                fs.writeFileSync(fileName, exportNest(selected.pop()));
            }
        });
    };

    var exportdxf = document.querySelector('#exportdxf');
    exportdxf.onclick = function () {
        var dialog = app.dialog;
        dialog.showSaveDialog({
            title: 'Export Deepnest DXF',
            properties: ['openFile'],
            filters: [
                { name: 'DXF', extensions: ['dxf'] }
            ]
        }, function (filename) {
            var fullFilename = filename;
            var ext = path.extname(fullFilename);
            var filename = path.basename(fullFilename);
            var filePath = path.dirname(fullFilename);

            var selected = DeepNest.nests.filter(function (n) {
                return n.selected;
            });

            if (selected.length == 0 || filename === undefined) {
                console.log("No file/nest selected");
            }
            // else if (!config.getSync('useConverterDeepnestIo')) {
            // 	console.log("Export fullFilename=", fullFilename);
            // 	var filenameSvg = `${filePath}/${path.basename(fullFilename, ext)}.svg`;
            // 	var filenameXml = `${filePath}/${path.basename(fullFilename, ext)}.xml`;
            // 	console.log(`Filename=${fullFilename}`);
            // }
            else {
                // send to conversion server
                var url = config.getSync('conversionServer');
                if (!url) {
                    url = defaultConversionServer;
                }
                console.log("conversionServer=", url);

                exportbutton.className = 'button export spinner';

                var req = request.post(url, function (err, resp, body) {
                    exportbutton.className = 'button export';
                    if (err) {
                        message('could not contact file conversion server', true);
                    } else {
                        if (body.substring(0, 5) == 'error') {
                            message(body, true);
                        }
                        else {
                            fs.writeFileSync(fullFilename, body);
                            console.log(`Export file ${fullFilename} created...`);
                        }
                    }
                });

                var form = req.form();
                form.append('format', 'dxf');
                form.append('fileUpload', exportNest(selected.pop(), true), {
                    filename: 'deepnest.svg',
                    contentType: 'image/svg+xml'
                });
            }
        });
    };
    /*
    var exportgcode = document.querySelector('#exportgcode');
    exportgcode.onclick = function(){
        var dialog = app.dialog;
        dialog.showSaveDialog({title: 'Export Deepnest Gcode'}, function (fileName) {
            if(fileName === undefined){
                console.log("No file selected");
            }
            else{
                var selected = DeepNest.nests.filter(function(n){
                    return n.selected;
                });
                
                if(selected.length == 0){
                    return false;
                }
                // send to conversion server
                var url = config.getSync('conversionServer');
                if(!url){
                    url = defaultConversionServer;
                }
                
                exportbutton.className = 'button export spinner';
                
                var req = request.post(url, function (err, resp, body) {
                    exportbutton.className = 'button export';
                    if (err) {
                        message('could not contact file conversion server', true);
                    } else {
                        if(body.substring(0, 5) == 'error'){
                            message(body, true);
                        }
                        else{
                            fs.writeFileSync(fileName, body);
                        }
                    }
                });

                var form = req.form();
                form.append('format', 'gcode');
                form.append('fileUpload', exportNest(selected.pop(), true), {
                  filename: 'deepnest.svg',
                  contentType: 'image/svg+xml'
                });
            }
        });
    };*/

    // nest save
    var exportNest = function (n, dxf) {

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

        var svgwidth = 0;
        var svgheight = 0;

        // create elements if they don't exist, show them otherwise
        console.log(`ExportNest=${n}`);
        n.placements.forEach(function (s) {
            console.log('InForEachPlacement=', s);
            var group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            svg.appendChild(group);
            /*DeepNest.parts[s.sheet].svgelements.forEach(function(e){
                var node = e.cloneNode(false);
                node.setAttribute('stroke', '#000');
                node.setAttribute('fill', 'none');
                group.appendChild(node);
            });*/

            var sheetbounds = DeepNest.parts[s.sheet].bounds;
            console.log('sheetbounds=', sheetbounds);

            group.setAttribute('transform', 'translate(' + (-sheetbounds.x) + ' ' + (svgheight - sheetbounds.y) + ')');
            if (svgwidth < sheetbounds.width) {
                svgwidth = sheetbounds.width;
            }

            s.sheetplacements.forEach(function (p) {
                console.log('InForEachSheetPlacement=', p);
                var part = DeepNest.parts[p.source];
                var partgroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

                part.svgelements.forEach(function (e, index) {
                    console.log('InForEachElement=', e);
                    var node = e.cloneNode(false);

                    if (n.tagName == 'image') {
                        var relpath = n.getAttribute('data-href');
                        if (relpath) {
                            n.setAttribute('href', relpath);
                        }
                        n.removeAttribute('data-href');
                    }
                    partgroup.appendChild(node);
                });

                group.appendChild(partgroup);

                // position part
                partgroup.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ') rotate(' + p.rotation + ')');
            });

            // put next sheet below
            svgheight += 1.1 * sheetbounds.height;
        });

        var scale = config.getSync('scale');

        if (dxf) {
            scale /= Number(config.getSync('dxfExportScale')); // inkscape on server side
        }

        var units = config.getSync('units');
        if (units == 'mm') {
            scale /= 25.4;
        }

        svg.setAttribute('width', (svgwidth / scale) + (units == 'inch' ? 'in' : 'mm'));
        svg.setAttribute('height', (svgheight / scale) + (units == 'inch' ? 'in' : 'mm'));
        svg.setAttribute('viewBox', '0 0 ' + svgwidth + ' ' + svgheight);

        if (config.getSync('mergeLines') && n.mergedLength > 0) {
            SvgParser.applyTransform(svg);
            SvgParser.flatten(svg);
            SvgParser.splitLines(svg);
            SvgParser.mergeOverlap(svg, 0.1 * config.getSync('curveTolerance'));
            SvgParser.mergeLines(svg);

            // set stroke and fill for all
            var elements = Array.prototype.slice.call(svg.children);
            elements.forEach(function (e) {
                if (e.tagName != 'g' && e.tagName != 'image') {
                    e.setAttribute('fill', 'none');
                    e.setAttribute('stroke', '#000000');
                }
            });
        }

        return (new XMLSerializer()).serializeToString(svg);
    }

    // nesting display

    var displayNest = function (n) {
        // create svg if not exist
        var svg = document.querySelector('#nestsvg');

        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('id', 'nestsvg');
            document.querySelector('#nestdisplay').innerHTML = (new XMLSerializer()).serializeToString(svg);
            svg = document.querySelector('#nestsvg');
        }

        // remove active class from parts and sheets
        document.querySelectorAll('#nestsvg .part').forEach(function (p) {
            p.setAttribute('class', 'part');
        });

        document.querySelectorAll('#nestsvg .sheet').forEach(function (p) {
            p.setAttribute('class', 'sheet');
        });

        // remove laser markers
        document.querySelectorAll('#nestsvg .merged').forEach(function (p) {
            p.remove();
        });

        var svgwidth = 0;
        var svgheight = 0;

        // create elements if they don't exist, show them otherwise
        n.placements.forEach(function (s) {
            var groupelement = document.querySelector('#sheet' + s.sheetid);
            if (!groupelement) {
                var group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                group.setAttribute('id', 'sheet' + s.sheetid);
                group.setAttribute('data-index', s.sheetid);

                svg.appendChild(group);
                groupelement = document.querySelector('#sheet' + s.sheetid);

                DeepNest.parts[s.sheet].svgelements.forEach(function (e) {
                    var node = e.cloneNode(false);
                    node.setAttribute('stroke', '#ffffff');
                    node.setAttribute('fill', 'none');
                    node.removeAttribute('style');
                    groupelement.appendChild(node);
                });
            }

            // reset class (make visible)
            groupelement.setAttribute('class', 'sheet active');

            var sheetbounds = DeepNest.parts[s.sheet].bounds;
            groupelement.setAttribute('transform', 'translate(' + (-sheetbounds.x) + ' ' + (svgheight - sheetbounds.y) + ')');
            if (svgwidth < sheetbounds.width) {
                svgwidth = sheetbounds.width;
            }

            s.sheetplacements.forEach(function (p) {
                var partelement = document.querySelector('#part' + p.id);
                if (!partelement) {
                    var part = DeepNest.parts[p.source];
                    var partgroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    partgroup.setAttribute('id', 'part' + p.id);

                    part.svgelements.forEach(function (e, index) {
                        var node = e.cloneNode(false);
                        if (index == 0) {
                            node.setAttribute('fill', 'url(#part' + p.source + 'hatch)');
                            node.setAttribute('fill-opacity', '0.5');
                        }
                        else {
                            node.setAttribute('fill', '#404247');
                        }
                        node.removeAttribute('style');
                        node.setAttribute('stroke', '#ffffff');
                        partgroup.appendChild(node);
                    });

                    svg.appendChild(partgroup);

                    if (!document.querySelector('#part' + p.source + 'hatch')) {
                        // make a nice hatch pattern
                        var pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
                        pattern.setAttribute('id', 'part' + p.source + 'hatch');
                        pattern.setAttribute('patternUnits', 'userSpaceOnUse');

                        var psize = parseInt(DeepNest.parts[s.sheet].bounds.width / 120);

                        psize = psize || 10;

                        pattern.setAttribute('width', psize);
                        pattern.setAttribute('height', psize);
                        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        path.setAttribute('d', 'M-1,1 l2,-2 M0,' + psize + ' l' + psize + ',-' + psize + ' M' + (psize - 1) + ',' + (psize + 1) + ' l2,-2');
                        path.setAttribute('style', 'stroke: hsl(' + (360 * (p.source / DeepNest.parts.length)) + ', 100%, 80%) !important; stroke-width:1');
                        pattern.appendChild(path);

                        groupelement.appendChild(pattern);
                    }

                    partelement = document.querySelector('#part' + p.id);
                }
                else {
                    // ensure correct z layering
                    svg.appendChild(partelement);
                }

                // reset class (make visible)
                partelement.setAttribute('class', 'part active');

                // position part
                partelement.setAttribute('style', 'transform: translate(' + (p.x - sheetbounds.x) + 'px, ' + (p.y + svgheight - sheetbounds.y) + 'px) rotate(' + p.rotation + 'deg)');

                // add merge lines
                if (p.mergedSegments && p.mergedSegments.length > 0) {
                    for (var i = 0; i < p.mergedSegments.length; i++) {
                        var s1 = p.mergedSegments[i][0];
                        var s2 = p.mergedSegments[i][1];
                        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line.setAttribute('class', 'merged');
                        line.setAttribute('x1', s1.x - sheetbounds.x);
                        line.setAttribute('x2', s2.x - sheetbounds.x);
                        line.setAttribute('y1', s1.y + svgheight - sheetbounds.y);
                        line.setAttribute('y2', s2.y + svgheight - sheetbounds.y);
                        svg.appendChild(line);
                    }
                }
            });

            // put next sheet below
            svgheight += 1.1 * sheetbounds.height;
        });

        setTimeout(function () {
            document.querySelectorAll('#nestsvg .merged').forEach(function (p) {
                p.setAttribute('class', 'merged active');
            });
        }, 1500);

        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('viewBox', '0 0 ' + svgwidth + ' ' + svgheight);
    }

    window.nest = new Ractive({
        el: '#nestcontent',
        //magic: true,
        template: '#nest-template',
        data: {
            nests: DeepNest.nests,
            getSelected: function () {
                var ne = this.get('nests');
                return ne.filter(function (n) {
                    return n.selected;
                });
            },
            getNestedPartSources: function (n) {
                var p = [];
                for (var i = 0; i < n.placements.length; i++) {
                    var sheet = n.placements[i];
                    for (var j = 0; j < sheet.sheetplacements.length; j++) {
                        p.push(sheet.sheetplacements[j].source);
                    }
                }
                return p;
            },
            getColorBySource: function (id) {
                return 'hsl(' + (360 * (id / DeepNest.parts.length)) + ', 100%, 80%)';
            },
            getPartsPlaced: function () {
                var ne = this.get('nests');
                var selected = ne.filter(function (n) {
                    return n.selected;
                });

                if (selected.length == 0) {
                    return '';
                }

                selected = selected.pop();

                var num = 0;
                for (var i = 0; i < selected.placements.length; i++) {
                    num += selected.placements[i].sheetplacements.length;
                }

                var total = 0;
                for (i = 0; i < DeepNest.parts.length; i++) {
                    if (!DeepNest.parts[i].sheet) {
                        total += DeepNest.parts[i].quantity;
                    }
                }

                return num + '/' + total;
            },
            getTimeSaved: function () {
                var ne = this.get('nests');
                var selected = ne.filter(function (n) {
                    return n.selected;
                });

                if (selected.length == 0) {
                    return '0 seconds';
                }

                selected = selected.pop();

                var totalLength = selected.mergedLength;

                var scale = config.getSync('scale');
                var lengthinches = totalLength / scale;

                var seconds = lengthinches / 2; // assume 2 inches per second cut speed
                return millisecondsToStr(seconds * 1000);
            }
        }
    });

    nest.on('selectnest', function (e, n) {
        for (var i = 0; i < DeepNest.nests.length; i++) {
            DeepNest.nests[i].selected = false;
        }
        n.selected = true;
        window.nest.update('nests');
        displayNest(n);
    });

    // prevent drag/drop default behavior
    document.ondragover = document.ondrop = (ev) => {
        ev.preventDefault();
    }

    document.body.ondrop = (ev) => {
        ev.preventDefault();
    }

    var windowManager = app.require('electron-window-manager');

    const BrowserWindow = app.BrowserWindow;
    const url = require('url');

    window.loginWindow = null;
});

ipcRenderer.on('background-progress', (event, p) => {
    /*var bar = document.querySelector('#progress'+p.index);
    if(p.progress < 0 && bar){
        // negative progress = finish
        bar.className = 'progress';
        bar.removeAttribute('id');
        return;
    }
    
    if(!bar){
        bar = document.querySelector('li.progress:not(.active)');
        bar.setAttribute('id', 'progress'+p.index);
        bar.className = 'progress active';
    }
    
    bar.querySelector('.bar').setAttribute('style', 'stroke-dashoffset: ' + parseInt((1-p.progress)*111));*/
    var bar = document.querySelector('#progressbar');
    bar.setAttribute('style', 'width: ' + parseInt(p.progress * 100) + '%' + (p.progress < 0.01 ? '; transition: none' : ''));
});

function message(txt, error) {
    var message = document.querySelector('#message');
    if (error) {
        message.className = 'error';
    }
    else {
        message.className = '';
    }
    document.querySelector('#messagewrapper').className = 'active';
    setTimeout(function () {
        message.className += ' animated bounce';
    }, 100);
    var content = document.querySelector('#messagecontent');
    content.innerHTML = txt;
}

var _now = Date.now || function () { return new Date().getTime(); };

var throttle = function (func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function () {
        previous = options.leading === false ? 0 : _now();
        timeout = null;
        result = func.apply(context, args);
        context = args = null;
    };
    return function () {
        var now = _now();
        if (!previous && options.leading === false) previous = now;
        var remaining = wait - (now - previous);
        context = this;
        args = arguments;
        if (remaining <= 0) {
            clearTimeout(timeout);
            timeout = null;
            previous = now;
            result = func.apply(context, args);
            context = args = null;
        } else if (!timeout && options.trailing !== false) {
            timeout = setTimeout(later, remaining);
        }
        return result;
    };
};

function millisecondsToStr(milliseconds) {
    function numberEnding(number) {
        return (number > 1) ? 's' : '';
    }

    var temp = Math.floor(milliseconds / 1000);
    var years = Math.floor(temp / 31536000);
    if (years) {
        return years + ' year' + numberEnding(years);
    }
    var days = Math.floor((temp %= 31536000) / 86400);
    if (days) {
        return days + ' day' + numberEnding(days);
    }
    var hours = Math.floor((temp %= 86400) / 3600);
    if (hours) {
        return hours + ' hour' + numberEnding(hours);
    }
    var minutes = Math.floor((temp %= 3600) / 60);
    if (minutes) {
        return minutes + ' minute' + numberEnding(minutes);
    }
    var seconds = temp % 60;
    if (seconds) {
        return seconds + ' second' + numberEnding(seconds);
    }

    return '0 seconds';
}

  //var addon = require('../build/Release/addon');