var fs = require('fs');
var path = require('path');
var expat = require('node-expat');
var parser = require('./parser');
var backgrounder = require("backgrounder");


var wurflFile = path.join(__dirname, '../wurfl 2.xml');
var userAgents = {};
var worker;
var callbacks = {watch: {}, load: {}};
var allDevices = {};


function get(userAgent, deepcopy, notEqual) {
	var device;
	if (notEqual){
		for(var dev in allDevices){
			var currDevice = allDevices[dev];
			if (currDevice.user_agent && currDevice.user_agent.indexOf(userAgent)>-1){
				if (currDevice.actual_device_root  && currDevice.product_info!=='undefined' && currDevice.product_info.is_tablet!=='undefined'){
					console.log(currDevice.fall_back)
					device = currDevice;
					break;
				}
			}
		}
	}else{
  		device = userAgents[userAgent];
	}
	if (device && device.fall_back && !Object.keys(device.product_info).length){
		var fallback = this[device.fall_back];
		//console.log(fallback);
		//device.product_info=fallback.product_info;

	}
  if(deepcopy && device !== undefined) {
    device = device.deepCopy(1);
  }
  if (typeof(device)!= 'undefined' && device.product_info){
  		device.product_info = findProductInfo(device);
  }
	return device;
}

function findProductInfo(device){
	var product_info = {};
	if (typeof(device) != 'undefined' && typeof(device.product_info)!='undefined' && !device.product_info.is_tablet){
		return merge(product_info,findProductInfo(allDevices[device.fall_back]));
	}
	return product_info;
}

function merge(obj1, obj2){
	for (var attrname in obj2) { obj1[attrname] = obj2[attrname]; }
	  return obj1;
}
function getAll() {
	return userAgents;
}

function close() {
	if (worker) worker.terminate();
}

// lazily load the worker
function getWorker() {
	if (!worker) {
		worker = new backgrounder.spawn(path.join(__dirname, './worker.js'));
		
		worker.on('message', function(data) {
			var method = data.method;
			var file = data.file;
			var devices = data.devices;
			packageDevices(devices);
			var callback = callbacks[method][file];
			if (callback) callback();
		});
		
		worker.on('error', function(error) {
			console.error(error);
		});
	}
	
	return worker;
}


function watch(options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = undefined;
	}
	if (typeof options === 'string') {
		options = { file: options };
	}
	options = options || { file: options };
	options.file = options.file || wurflFile;
	
	if (callback) callbacks.watch[file] = callback;
	
	getWorker().send({
		method: 'watch',
		file: options.file,
		groups: options.groups
	});
}


function load(options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = undefined;
	}
	if (typeof options === 'string') {
		options = { file: options };
	}
	options = options || { file: options };
	options.file = options.file || wurflFile;
	
	if (callback) callbacks.load[options.file] = callback;
	
	getWorker().send({
		method: 'load',
		file: options.file,
		groups: options.groups
	});
}


function loadSync(options) {
	if (typeof options === 'string') {
		options = { file: options };
	}
	options = options || { file: options };
	options.file = options.file || wurflFile;
	
	var contents = fs.readFileSync(options.file);
	packageDevices(parser.parse(contents, options.groups));
}


function packageDevices(devices) {
	var agents = {};
	//console.log(devices)
	// add the lookup first
	allDevices = devices;
	devices.forEach(function(device) {
		devices[device.id] = device;
	});
	
	// create device objects from each one
	devices.forEach(function(device, i, array) {
		if (device instanceof Device) return;
		array[i] = createDevice(device, devices, agents);
	});
	
	userAgents = agents;
}


function createDevice(attr, lookup, agents) {
	
	if ( attr.fall_back != 'root' && !(lookup[attr.fall_back] instanceof Device)) {
		 createDevice(lookup[attr.fall_back], lookup, agents);
	}
		
	
	var groups = attr.groups;
	delete attr.groups;
	var device = new Device(attr);
	lookup[device.id] = device; // add a lookup by id
	agents[device.user_agent] = device; // and a lookup by user agent
	
	var parent = lookup[attr.fall_back];
	if (parent) {
		for (var i in parent) {
			var group = parent[i];
			if (group instanceof Group) {
				device[i] = group;
			}
		}
	}
	
	for (var id in groups) {
		group = device[id];
		var GroupClass = function() {};
		GroupClass.prototype = group ? new group.constructor() : new Group();
		var groupProto = GroupClass.prototype;
		groupProto.constructor = GroupClass;
		groupProto.id = device.id + '.' + id;
		device[id] = group = new GroupClass();
		
		var capabilities = groups[id];
		for (var name in capabilities) {
			groupProto[name] = capabilities[name];
		}
	}
	
	return device;
}


function Device(attr) {
	for (var i in attr)
		if (attr.hasOwnProperty(i)) this[i] = attr[i];
}

Device.prototype.deepCopy = function(howDeep) {
  var dc = {}, attr = this;
  var i = howDeep;
  for(var i in attr) {
    dc[i] = attr[i];

    for(var k in attr[i]) {
      if(k != 'constructor')
        dc[i][k] = attr[i][k];
    }
  }

  return dc;
};



function Group() {}


exports.watch = watch;
exports.load = load;
exports.loadSync = loadSync;
exports.get = get;
exports.getAll = getAll;
exports.close = close;
