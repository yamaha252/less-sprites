#!/usr/bin/env node

var async = require('async');
var path = require('path');
var util = require('util');
var gm = require('gm');
var im = gm.subClass({ imageMagick: true });
var fs = require('fs');
var Q = require('q');


function Sprites() {
	this.specs = {
		appendRight: false
	};
	this.readArgs();
}

Sprites.prototype.createSprite = function(sourceDir, imgPath, sourceFiles, destPath, lessPath, scanDirs) {

	this.sourceDir = sourceDir;
	this.imgPath = imgPath;
	this.destPath = path.resolve(destPath);
	this.lessPath = path.resolve(lessPath);

	if (!sourceFiles)
		sourceFiles = this.readDirectory(this.sourceDir, (scanDirs));

	this.files = [];
	this.spriteFile = im();
	this.spriteFile.out('-background', 'none');

	sourceFiles = this.getSourceFiles(sourceFiles);
	if (!sourceFiles.length) {
		throw new Error('No valid source files were provided.');
	}

	this.combine(sourceFiles)
		.then(function() {
			this.spriteFile.write(this.destPath, function(err) {
				if (err) throw err;
			});
			this.writeStyles();
		}.bind(this));
};

Sprites.prototype.readDirectory = function(dir, recursive) {
	var results = [];

	var list = fs.readdirSync(dir+'/');

	if (!list) return results;

	list.forEach(function(file) {
		file = dir + '/' + file;
		var stat = fs.statSync(file);
		if (stat && stat.isDirectory() && recursive!=undefined) {
			results = results.concat(this.readDirectory(file, recursive));
		} else {
			results.push(file.replace(path.resolve(this.sourceDir)+'/', ''));
		}
	}.bind(this));

	return results;
};

Sprites.prototype.getSourceFiles = function(files) {
	var file,
		sourceFiles = [];

	for (var i = 0, l = files.length; i < l; i++) {
		file = files[i];
		if (file.match(/.*\.png$/i) && path.resolve(file) != this.destPath) {
			sourceFiles.push(file);
		}
	}

	return sourceFiles;
};

Sprites.prototype.combine = function(files) {
	var deferred = Q.defer();
	async.each(files, this.processFile.bind(this), function(err) {
		if (err) {
			deferred.reject(new Error(err));
		} else {
			deferred.resolve();
		}
	});
	return deferred.promise;
};

Sprites.prototype.processFile = function(fileName, callback) {
	var filePath = path.join(this.sourceDir, fileName);
	if (!fs.existsSync(filePath)) {
		throw new Error('Source file "' + filePath + '" does not exist.');
	}
	im(filePath).size(function(err, size) {
		if (err) throw err;
		this.spriteFile.append(filePath, this.specs.appendRight);
		this.files.push({
			name: fileName,
			size: size
		});
		callback();
	}.bind(this));
};

Sprites.prototype.writeStyles = function() {
	var relPath = path.relative(this.sourceDir, path.dirname(this.destPath));
	var spriteFile = path.join(this.imgPath, relPath, path.basename(this.destPath));
	var content = '';
	var x = 0;
	var y = 0;

	for (var i = 0, l = this.files.length; i < l; i++) {
		content += util.format(
			'.sprite-pos("%s") {\n\tbackground-position: %dpx %dpx;\n}\n',
			this.files[i].name, x, y
		);
		if (this.specs.appendRight) {
			x -= this.files[i].size.width;
		} else {
			y -= this.files[i].size.height;
		}
	}

	content += util.format(
		'.sprite(@img) {\n' +
		'\tbackground-image: url("%s");\n'+
		'\t.sprite-pos(@img);\n' +
		'}\n',
		spriteFile
	);

	fs.writeFile(this.lessPath, content, function(err) {
		if (err) throw err;
	});
};

Sprites.prototype.readArgs = function() {
	var argv = process.argv.splice(2);

	if (!argv.length || argv[0] == '-h' || argv[0] == '--help') {
		this.printUsage();
		process.exit();
	}

	var specsFile = argv[0];
	if (!fs.existsSync(specsFile)) {
		console.log('Error: Specs file "' + specsFile + '" does not exist.');
		process.exit();
	}
	specsFile =  path.resolve(specsFile);
	var specs = require(specsFile);
	if (!specs['dir']) {
		specs['dir'] = '.';
	}

	// default directory is same as the json
	if (!specs['sprite']) {
		specs['sprite'] = path.basename(specsFile, '.json') + '.png';
	}
	// relative to the specsFile directory.
	if (specs['sprite'][0] != '/') {
		specs['sprite'] = path.dirname(specsFile) + '/' + specs['sprite'];
	}

	if (!specs['less']) {
		specs['less'] = path.basename(specsFile, '.json') + '.less';
	}

	if (specs['less'][0] != '/') {
		specs['less'] = path.dirname(specsFile) + '/' + specs['less'];
	}

	if (specs['direction']) {
		this.specs.appendRight = specs['direction'] == 'right';
	}

	this.createSprite(
		path.resolve(specsFile, '..', specs['dir']),
		specs['imgPath'],
		specs['files'],
		specs['sprite'],
		specs['less'],
		specs['scanDirs']
	);
};

Sprites.prototype.printUsage = function() {
	console.log('Usage: less-sprites sprite-specs.json');
};

new Sprites();
