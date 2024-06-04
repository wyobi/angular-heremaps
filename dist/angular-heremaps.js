(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
module.exports = HereMapsDirective;

HereMapsDirective.$inject = [
    '$timeout',
    '$window',
    '$rootScope',
    '$filter',
    'HereMapsConfig',
    'HereMapsAPIService',
    'HereMapsUtilsService',
    'HereMapsMarkerService',
    'HereMapsRoutesService',
    'HereMapsCONSTS',
    'HereMapsEventsFactory',
    'HereMapsUiFactory'
];
function HereMapsDirective(
    $timeout,
    $window,
    $rootScope,
    $filter,
    HereMapsConfig,
    HereMapsAPIService,
    HereMapsUtilsService,
    HereMapsMarkerService,
    HereMapsRoutesService,
    HereMapsCONSTS,
    HereMapsEventsFactory,
    HereMapsUiFactory) {

    HereMapsDirectiveCtrl.$inject = ['$scope', '$element', '$attrs'];

    return {
        restrict: 'EA',
        template: "<div ng-style=\"{'width': mapWidth, 'height': mapHeight}\"></div>",
        replace: true,
        scope: {
            opts: '&options',
            places: '&',
            onMapReady: "&mapReady",
            events: '&'
        },
        controller: HereMapsDirectiveCtrl
    }

    function HereMapsDirectiveCtrl($scope, $element, $attrs) {
        var CONTROL_NAMES = HereMapsCONSTS.CONTROLS.NAMES,
            places = $scope.places(),
            opts = $scope.opts(),
            listeners = $scope.events();

        var options = angular.extend({}, HereMapsCONSTS.DEFAULT_MAP_OPTIONS, opts),
            position = HereMapsUtilsService.isValidCoords(options.coords) ?
                options.coords : HereMapsCONSTS.DEFAULT_MAP_OPTIONS.coords;

        var heremaps = { id: HereMapsUtilsService.generateId() },
            mapReady = $scope.onMapReady(),
            _onResizeMap = null;

        $timeout(function () {
            return _setMapSize();
        }).then(function () {
            HereMapsAPIService.loadApi().then(_apiReady).catch(function(e) {
                console.error(e);
            });
        });

        options.resize && addOnResizeListener();

        $scope.$on('$destroy', function () {
            $window.removeEventListener('resize', _onResizeMap);
        });

        function addOnResizeListener() {
            _onResizeMap = HereMapsUtilsService.throttle(_resizeHandler, HereMapsCONSTS.UPDATE_MAP_RESIZE_TIMEOUT);
            $window.addEventListener('resize', _onResizeMap);
        }

        function _apiReady() {
            _setupMapPlatform();
            _setupMap();
        }

        function _setupMapPlatform() {
            if (!HereMapsConfig.app_id || (!HereMapsConfig.app_code && !HereMapsConfig.apiKey))
                throw new Error('app_id or either of app_code and apiKey were missed. Please specify their in HereMapsConfig');

            heremaps.platform = new H.service.Platform(HereMapsConfig);
            heremaps.layers = heremaps.platform.createDefaultLayers();
        }

        function _getLocation(enableHighAccuracy, maximumAge) {
            var _enableHighAccuracy = !!enableHighAccuracy,
                _maximumAge = maximumAge || 0;

            return HereMapsAPIService.getPosition({
                enableHighAccuracy: _enableHighAccuracy,
                maximumAge: _maximumAge
            });
        }

        function _locationFailure() {
            console.error('Can not get a geo position');
        }

        function _setupMap() {
            _initMap(function () {
                HereMapsAPIService.loadModules($attrs.$attr, {
                    "controls": _uiModuleReady,
                    "events": _eventsModuleReady
                });
            });
        }

        function _initMap(cb) {
            var map = heremaps.map = new H.Map($element[0], heremaps.layers.vector.normal.map, {
                zoom: HereMapsUtilsService.isValidCoords(position) ? options.zoom : options.maxZoom,
                center: new H.geo.Point(position.latitude, position.longitude)
            });

            HereMapsMarkerService.addMarkersToMap(map, places, true);

            if (HereMapsConfig.mapTileConfig)
                _setCustomMapStyles(map, HereMapsConfig.mapTileConfig);

            mapReady && mapReady(MapProxy());

            cb && cb();

        }

        function _uiModuleReady() {
            HereMapsUiFactory.start({
                platform: heremaps,
                alignment: $attrs.controls
            });
        }

        function _eventsModuleReady() {
            HereMapsEventsFactory.start({
                platform: heremaps,
                listeners: listeners,
                options: options,
                injector: _moduleInjector
            });
        }

        function _moduleInjector() {
            return function (id) {
                return heremaps[id];
            }
        }

        function _resizeHandler(height, width) {
            _setMapSize.apply(null, arguments);

            heremaps.map.getViewPort().resize();
        }

        function _setMapSize(height, width) {
            var height = height || $element[0].parentNode.offsetHeight || options.height,
                width = width || $element[0].parentNode.offsetWidth || options.width;

            $scope.mapHeight = height + 'px';
            $scope.mapWidth = width + 'px';

            HereMapsUtilsService.runScopeDigestIfNeed($scope);
        }
        
        function _setCustomMapStyles(map, config) {
            // Create a MapTileService instance to request base tiles (i.e. base.map.api.here.com):
            // var mapTileService = heremaps.platform.getMapTileService({ 'type': 'base' });
            var rasterTileService = heremaps.platform.getRasterTileService({
                format: config.format || 'png', 
                queryParams: {
                    lang: 'en',
                    ppi:  config.ppi || 400,
                    style: config.style || 'explore.day',
                    congestion: config.congestion || 'true',
                    features: config.features || 'pois:all,environmental_zones:all,congestion_zones:all,vehicle_restrictions:active_and_inactive'
                },
            });

            // Create a tile layer which requests map tiles
            // var newStyleLayer = mapTileService.createTileLayer(
            //     'maptile', 
            //     config.scheme || 'normal.day', 
            //     config.size || 256, 
            //     config.format || 'png8', 
            //     config.metadataQueryParams || {}
            // );
            var rasterTileProvider = new H.service.rasterTile.Provider(rasterTileService, {
                // engineType: H.Map.EngineType.HARP,
                tileSize: 512
            });
            
            var newStyleLayer = new H.map.layer.TileLayer(rasterTileProvider);
            
            // Set new style layer as a base layer on the map:
            map.setBaseLayer(newStyleLayer);
        }

        function MapProxy() {
            return {
                refresh: function () {
                    var currentBounds = this.getViewBounds();

                    this.setMapSizes();
                    this.setViewBounds(currentBounds);
                },
                setMapSizes: function (height, width) {
                    _resizeHandler.apply(null, arguments);
                },
                getPlatform: function () {
                    return heremaps;
                },
                calculateRoute: function (driveType, direction) {
                    return HereMapsRoutesService.calculateRoute(heremaps, {
                        driveType: driveType,
                        direction: direction
                    });
                },
                addRouteToMap: function (routeData, clean) {
                    HereMapsRoutesService.addRouteToMap(heremaps.map, routeData, clean);
                },
                setZoom: function (zoom, step) {
                    HereMapsUtilsService.zoom(heremaps.map, zoom || 10, step);
                },
                getZoom: function () {
                    return heremaps.map.getZoom();
                },
                getCenter: function () {
                    return heremaps.map.getCenter();
                },
                getViewBounds: function () {
                    return heremaps.map.getViewBounds();
                },
                setViewBounds: function (boundingRect, opt_animate) {
                    HereMapsMarkerService.setViewBounds(heremaps.map, boundingRect, opt_animate);
                },
                getBoundsRectFromPoints: function (topLeft, bottomRight) {
                    return HereMapsUtilsService.getBoundsRectFromPoints.apply(null, arguments);
                },
                setCenter: function (coords, opt_animate) {
                    if (!coords) {
                        return console.error('coords are not specified!');
                    }

                    heremaps.map.setCenter(coords, opt_animate);
                },
                cleanRoutes: function () {
                    HereMapsRoutesService.cleanRoutes(heremaps.map);
                },

                /**
                 * @param {Boolean} enableHighAccuracy
                 * @param {Number} maximumAge - the maximum age in milliseconds of a possible cached position that is acceptable to return. If set to 0, it means that the device cannot use a cached position and must attempt to retrieve the real current position
                 * @return {Promise}
                 */
                getUserLocation: function (enableHighAccuracy, maximumAge) {
                    return _getLocation.apply(null, arguments).then(function (position) {
                        var coords = position.coords;

                        return {
                            lat: coords.latitude,
                            lng: coords.longitude
                        };
                    })
                },
                geocodePosition: function (coords, options) {
                    return HereMapsAPIService.geocodePosition(heremaps.platform, {
                        coords: coords,
                        radius: options && options.radius,
                        lang: options && options.lang
                    });
                },
                geocodeAddress: function (address) {
                    return HereMapsAPIService.geocodeAddress(heremaps.platform, {
                        searchtext: address && address.searchtext,
                        country: address && address.country,
                        city: address && address.city,
                        street: address && address.street,
                        housenumber: address && address.housenumber
                    });
                },
                geocodeAutocomplete: function (query, options) {
                    return HereMapsAPIService.geocodeAutocomplete({
                        query: query,
                        beginHighlight: options && options.beginHighlight,
                        endHighlight: options && options.endHighlight,
                        maxresults: options && options.maxresults
                    });
                },
                findLocationById: function (locationId) {
                    return HereMapsAPIService.findLocationById(locationId);
                },
                updateMarkers: function (places, refreshViewbounds) {
                    HereMapsMarkerService.updateMarkers(heremaps.map, places, refreshViewbounds);
                },
                getMapFactory: function (){
                    return HereMapsUtilsService.getMapFactory();
                }
            }
        }

    }
};

},{}],2:[function(require,module,exports){
require('./providers/markers');
require('./providers/map-modules');
require('./providers/routes');

module.exports = angular.module('heremaps', [
    'heremaps-markers-module',
    'heremaps-routes-module',
    'heremaps-map-modules'
])
    .provider('HereMapsConfig', require('./providers/mapconfig.provider'))
    .service('HereMapsUtilsService', require('./providers/maputils.service'))
    .service('HereMapsAPIService', require('./providers/api.service'))
    .constant('HereMapsCONSTS', require('./providers/consts'))
    .directive('heremaps', require('./heremaps.directive'));

},{"./heremaps.directive":1,"./providers/api.service":3,"./providers/consts":4,"./providers/map-modules":7,"./providers/mapconfig.provider":9,"./providers/maputils.service":10,"./providers/markers":13,"./providers/routes":17}],3:[function(require,module,exports){
module.exports = HereMapsAPIService;

HereMapsAPIService.$inject = [
    '$q',
    '$http',
    'HereMapsConfig',
    'HereMapsUtilsService',
    'HereMapsCONSTS'
];
function HereMapsAPIService($q, $http, HereMapsConfig, HereMapsUtilsService, HereMapsCONSTS) {
    var version = HereMapsConfig.apiVersion,
        protocol = HereMapsConfig.useHTTPS ? 'https' : 'http';

    var API_VERSION = {
        V: parseInt(version),
        SUB: version
    };

    var CONFIG = {
        BASE: "://js.api.here.com/v",
        CORE: "mapsjs-core.js",
        CORELEGACY: "mapsjs-core-legacy.js",
        SERVICE: "mapsjs-service.js",
        SERVICELEGACY: "mapsjs-service-legacy.js",
        UI: {
            src: "mapsjs-ui.js",
            href: "mapsjs-ui.css"
        },
        EVENTS: "mapsjs-mapevents.js",
        AUTOCOMPLETE_URL: "://autocomplete.geocoder.cit.api.here.com/6.2/suggest.json",
        LOCATION_URL: "://geocoder.cit.api.here.com/6.2/geocode.json"
    };

    var API_DEFERSQueue = {};

    API_DEFERSQueue[CONFIG.CORE] = [];
    API_DEFERSQueue[CONFIG.CORELEGACY] = [];
    API_DEFERSQueue[CONFIG.SERVICE] = [];
    API_DEFERSQueue[CONFIG.SERVICELEGACY] = [];
    API_DEFERSQueue[CONFIG.UI.src] = [];
    API_DEFERSQueue[CONFIG.PANO] = [];
    API_DEFERSQueue[CONFIG.EVENTS] = [];

    var head = document.getElementsByTagName('head')[0];

    return {
        loadApi: loadApi,
        loadModules: loadModules,
        getPosition: getPosition,
        geocodePosition: geocodePosition,
        geocodeAddress: geocodeAddress,
        geocodeAutocomplete: geocodeAutocomplete,
        findLocationById: findLocationById
    };

    //#region PUBLIC
    function loadApi() {
        return _getLoader(CONFIG.CORE)
            .then(function () {
                return _getLoader(CONFIG.CORELEGACY);
            }).then(function () {
                return _getLoader(CONFIG.SERVICE);
            }).then(function () {
                return _getLoader(CONFIG.SERVICELEGACY);
            });
    }

    function loadModules(attrs, handlers) {
        for (var key in handlers) {
            if (!handlers.hasOwnProperty(key) || !attrs[key])
                continue;

            var loader = _getLoaderByAttr(key);

            loader()
                .then(handlers[key]);
        }
    }

    function getPosition(options) {
        var deferred = $q.defer();

        if (options && HereMapsUtilsService.isValidCoords(options.coords)) {
            deferred.resolve({ coords: options.coords });
        } else {
            navigator.geolocation.getCurrentPosition(function (response) {
                deferred.resolve(response);
            }, function (error) {
                deferred.reject(error);
            }, options);
        }

        return deferred.promise;
    }

    function geocodePosition(platform, params) {
        if (!params.coords)
            return console.error('Missed required coords');

        var geocoder = platform.getGeocodingService(),
            deferred = $q.defer(),
            _params = {
                prox: [params.coords.lat, params.coords.lng, params.radius || 250].join(','),
                mode: 'retrieveAddresses',
                maxresults: '1',
                gen: '8',
                language: params.lang || 'en-gb'
            };

        geocoder.reverseGeocode(_params, function (response) {
            deferred.resolve(response)
        }, function (error) {
            deferred.reject(error)
        });
        
        return deferred.promise;
    }

    function geocodeAddress(platform, params) {
        if (!params)
            return console.error('Missed required parameters');

        var geocoder = platform.getGeocodingService(),
            deferred = $q.defer(),
            _params = { gen: 8 };

        for (var key in params) { _params[key] = params[key]; }

        geocoder.geocode(_params, function (response) {
            deferred.resolve(response)
        }, function (error) {
            deferred.reject(error)
        });

        return deferred.promise;
    }

    function geocodeAutocomplete(params) {
        if (!params)
            return console.error('Missing required parameters');

        var autocompleteUrl = protocol + CONFIG.AUTOCOMPLETE_URL,
            deferred = $q.defer(),
            _params = {
                query: "",
                beginHighlight: "<mark>",
                endHighlight: "</mark>",
                maxresults: "5"
            };

        for (var key in _params) {
            if (angular.isDefined(params[key])) {
                _params[key] = params[key];
            }
        }

        _params.app_id = HereMapsConfig.app_id;
        _params.app_code = HereMapsConfig.app_code;
        _params.apiKey = HereMapsConfig.apiKey;

        $http.get(autocompleteUrl, { params: _params })
            .success(function(response) {
                deferred.resolve(response);
            })
            .error(function(error) {
                deferred.reject(error);
            });

        return deferred.promise;
    }

    /**
     * Finds location by HERE Maps Location identifier.
     */
    function findLocationById(locationId) {
        if (!locationId)
            return console.error('Missing Location Identifier');

        var locationUrl = protocol + CONFIG.LOCATION_URL,
            deferred = $q.defer(),
            _params = {
                locationid: locationId,
                gen: 9,
                app_id: HereMapsConfig.app_id,
                app_code: HereMapsConfig.app_code,
                apiKey: HereMapsConfig.apiKey
            };

        $http.get(locationUrl, { params: _params })
            .success(function(response) {
                deferred.resolve(response);
            })
            .error(function(error) {
                deferred.reject(error);
            });

        return deferred.promise;
    }

    //#endregion PUBLIC

    function _getLoaderByAttr(attr) {
        var loader;

        switch (attr) {
            case HereMapsCONSTS.MODULES.UI:
                loader = _loadUIModule;
                break;
            case HereMapsCONSTS.MODULES.EVENTS:
                loader = _loadEventsModule;
                break;
            default:
                throw new Error('Unknown module', attr);
        }

        return loader;
    }

    function _loadUIModule() {
        if (!_isLoaded(CONFIG.UI.src)) {
            var link = HereMapsUtilsService.createLinkTag({
                rel: 'stylesheet',
                type: 'text/css',
                href: _getURL(CONFIG.UI.href)
            });

            link && head.appendChild(link);
        }

        return _getLoader(CONFIG.UI.src);
    }

    function _loadEventsModule() {
        return _getLoader(CONFIG.EVENTS);
    }

    /**
     * @param {String} sourceName
     * return {String} e.g http://js.api.here.com/v{VER}/{SUBVERSION}/{SOURCE}
     */
    function _getURL(sourceName) {
        return [
            protocol,
            CONFIG.BASE,
            API_VERSION.V,
            "/",
            API_VERSION.SUB,
            "/",
            sourceName
        ].join("");
    }

    function _getLoader(sourceName) {
        var defer = $q.defer(), src, script;

        if (_isLoaded(sourceName)) {
            defer.resolve();
        } else {
            src = _getURL(sourceName);
            script = HereMapsUtilsService.createScriptTag({ src: src });

            script && head.appendChild(script);

            API_DEFERSQueue[sourceName].push(defer);

            script.onload = _onLoad.bind(null, sourceName);
            script.onerror = _onError.bind(null, sourceName);
        }

        return defer.promise;
    }

    function _isLoaded(sourceName) {
        var checker = null;

        switch (sourceName) {
            case CONFIG.CORE:
                checker = _isCoreLoaded;
                break;
            case CONFIG.SERVICE:
                checker = _isServiceLoaded;
                break;
            case CONFIG.UI.src:
                checker = _isUILoaded;
                break;
            case CONFIG.EVENTS:
                checker = _isEventsLoaded;
                break;
            default:
                checker = function () { return false };
        }

        return checker();
    }

    function _isCoreLoaded() {
        return !!window.H;
    }

    function _isServiceLoaded() {
        return !!(window.H && window.H.service);
    }

    function _isUILoaded() {
        return !!(window.H && window.H.ui);
    }

    function _isEventsLoaded() {
        return !!(window.H && window.H.mapevents);
    }

    function _onLoad(sourceName) {
        var deferQueue = API_DEFERSQueue[sourceName];
        for (var i = 0, l = deferQueue.length; i < l; ++i) {
            var defer = deferQueue[i];
            defer.resolve();
        }

        API_DEFERSQueue[sourceName] = [];
    }

    function _onError(sourceName) {
        var deferQueue = API_DEFERSQueue[sourceName];
        for (var i = 0, l = deferQueue.length; i < l; ++i) {
            var defer = deferQueue[i];
            defer.reject();
        }

        API_DEFERSQueue[sourceName] = [];
    }
};

},{}],4:[function(require,module,exports){
module.exports = {
    UPDATE_MAP_RESIZE_TIMEOUT: 500,
    ANIMATION_ZOOM_STEP: .05,
    MODULES: {
        UI: 'controls',
        EVENTS: 'events',
        PANO: 'pano'
    },
    DEFAULT_MAP_OPTIONS: {
        height: 480,
        width: 640,
        zoom: 12,
        maxZoom: 2,
        resize: false,
        draggable: false,
        coords: {
            longitude: 0,
            latitude: 0
        }
    },
    MARKER_TYPES: {
        DOM: "DOM",
        SVG: "SVG"
    },
    CONTROLS: {
        NAMES: {
            SCALE: 'scalebar',
            SETTINGS: 'mapsettings',
            ZOOM: 'zoom',
            USER: 'userposition'
        },
        POSITIONS: [
            'top-right',
            'top-center',
            'top-left',
            'left-top',
            'left-middle',
            'left-bottom',
            'right-top',
            'right-middle',
            'right-bottom',
            'bottom-right',
            'bottom-center',
            'bottom-left'
        ]
    },
    INFOBUBBLE: {
        STATE: {
            OPEN: 'open',
            CLOSED: 'closed'
        },
        DISPLAY_EVENT: {
            pointermove: 'onHover',
            tap: 'onClick'
        }
    },
    USER_EVENTS: {
        tap: 'click',
        pointermove: 'mousemove',
        pointerleave: 'mouseleave',
        pointerenter: 'mouseenter',
        drag: 'drag',
        dragstart: 'dragstart',
        dragend: 'dragend',
        mapviewchange: 'mapviewchange',
        mapviewchangestart: 'mapviewchangestart',
        mapviewchangeend: 'mapviewchangeend'
    }
}
},{}],5:[function(require,module,exports){
module.exports = HereMapsEventsFactory;

HereMapsEventsFactory.$inject = [
    'HereMapsUtilsService',
    'HereMapsMarkerService',
    'HereMapsCONSTS',
    'HereMapsInfoBubbleFactory'
];
function HereMapsEventsFactory(HereMapsUtilsService, HereMapsMarkerService, HereMapsCONSTS, HereMapsInfoBubbleFactory) {
    function Events(platform, Injector, listeners) {
        this.map = platform.map;
        this.listeners = listeners;
        this.inject = new Injector();
        this.events = platform.events = new H.mapevents.MapEvents(this.map);
        this.behavior = platform.behavior = new H.mapevents.Behavior(this.events);
        this.bubble = HereMapsInfoBubbleFactory.create();

        this.setupEventListeners();
    }

    var proto = Events.prototype;

    proto.setupEventListeners = setupEventListeners;
    proto.setupOptions = setupOptions;
    proto.triggerUserListener = triggerUserListener;
    proto.infoBubbleHandler = infoBubbleHandler;  

    return {
        start: function(args) {
            if (!(args.platform.map instanceof H.Map))
                return console.error('Missed required map instance');

            var events = new Events(args.platform, args.injector, args.listeners);

            args.options && events.setupOptions(args.options);
        }
    }

    function setupEventListeners() {
        var self = this;

        HereMapsUtilsService.addEventListener(this.map, 'tap', this.infoBubbleHandler.bind(this));

        HereMapsUtilsService.addEventListener(this.map, 'pointermove', this.infoBubbleHandler.bind(this));

        HereMapsUtilsService.addEventListener(this.map, 'dragstart', function(e) {
            if (HereMapsMarkerService.isMarkerInstance(e.target)) {
                self.behavior.disable();
            }

            self.triggerUserListener(HereMapsCONSTS.USER_EVENTS[e.type], e);
        });

        HereMapsUtilsService.addEventListener(this.map, 'drag', function(e) {
            var pointer = e.currentPointer,
                target = e.target;

            if (HereMapsMarkerService.isMarkerInstance(target)) {
                target.setGeometry(self.map.screenToGeo(pointer.viewportX, pointer.viewportY));
            }

            self.triggerUserListener(HereMapsCONSTS.USER_EVENTS[e.type], e);
        });

        HereMapsUtilsService.addEventListener(this.map, 'dragend', function(e) {
            if (HereMapsMarkerService.isMarkerInstance(e.target)) {
                self.behavior.enable();
            }

            self.triggerUserListener(HereMapsCONSTS.USER_EVENTS[e.type], e);
        });

        HereMapsUtilsService.addEventListener(this.map, 'mapviewchangestart', function(e) {
            self.triggerUserListener(HereMapsCONSTS.USER_EVENTS[e.type], e);
        });

        HereMapsUtilsService.addEventListener(this.map, 'mapviewchange', function(e) {
            self.triggerUserListener(HereMapsCONSTS.USER_EVENTS[e.type], e);
        });

        HereMapsUtilsService.addEventListener(this.map, 'mapviewchangeend', function(e) {
            self.triggerUserListener(HereMapsCONSTS.USER_EVENTS[e.type], e);
        });
    }

    function setupOptions(options) {
        if (!options)
            return;

        this.map.draggable = !!options.draggable;
    }

    function triggerUserListener(eventName, e) {
        if (!this.listeners)
            return;

        var callback = this.listeners[eventName];

        callback && callback(e);
    }
    
    function infoBubbleHandler(e){
        var ui = this.inject('ui');
        
        if(ui)
            this.bubble.toggle(e, ui);
            
        this.triggerUserListener(HereMapsCONSTS.USER_EVENTS[e.type], e);      
    }

};
},{}],6:[function(require,module,exports){
module.exports = HereMapsInfoBubbleFactory;

HereMapsInfoBubbleFactory.$inject = [
    'HereMapsMarkerService',
    'HereMapsUtilsService',
    'HereMapsCONSTS'
];
function HereMapsInfoBubbleFactory(HereMapsMarkerService, HereMapsUtilsService, HereMapsCONSTS) {
    function InfoBubble() {}

    var proto = InfoBubble.prototype;
        
    proto.create = create;
    proto.update = update;
    proto.toggle = toggle;
    proto.show = show;
    proto.close = close;

    return {
        create: function(){
            return new InfoBubble();
        }
    }

    function toggle(e, ui) {
        if (HereMapsMarkerService.isMarkerInstance(e.target))
            this.show(e, ui);
        else
            this.close(e, ui);
    }

    function update(bubble, data) {
        bubble.display = data.display;

        bubble.setGeometry(data.position);
        bubble.setContent(data.markup);

        bubble.setState(HereMapsCONSTS.INFOBUBBLE.STATE.OPEN);
    }

    function create(source) {
        var bubble = new H.ui.InfoBubble(source.position, {
            content: source.markup
        });

        bubble.display = source.display;
        bubble.addClass(HereMapsCONSTS.INFOBUBBLE.STATE.OPEN)

        HereMapsUtilsService.addEventListener(bubble, 'statechange', function(e) {
            var state = this.getState(),
                el = this.getElement();
            if (state === HereMapsCONSTS.INFOBUBBLE.STATE.CLOSED) {
                el.classList.remove(HereMapsCONSTS.INFOBUBBLE.STATE.OPEN);
            } else
                this.addClass(state)
        });

        return bubble;
    }

    function show(e, ui, data) {
        var target = e.target,
            data = target.getData(),
            el = null;

        if (!data || !data.display || !data.markup || data.display !== HereMapsCONSTS.INFOBUBBLE.DISPLAY_EVENT[e.type])
            return;

        var source = {
            position: target.getGeometry(),
            markup: data.markup,
            display: data.display
        };

        if (!ui.bubble) {
            ui.bubble = this.create(source);
            ui.addBubble(ui.bubble);

            return;
        }

        this.update(ui.bubble, source);
    }

    function close(e, ui) {
        if (!ui.bubble || ui.bubble.display !== HereMapsCONSTS.INFOBUBBLE.DISPLAY_EVENT[e.type]) {
            return;
        }

        ui.bubble.setState(HereMapsCONSTS.INFOBUBBLE.STATE.CLOSED);
    }
}
},{}],7:[function(require,module,exports){
angular.module('heremaps-events-module', [])
    .factory('HereMapsEventsFactory', require('./events/events.js'))
    .factory('HereMapsInfoBubbleFactory', require('./events/infobubble.js'));
    
angular.module('heremaps-ui-module', [])
    .factory('HereMapsUiFactory', require('./ui/ui.js'))

module.exports = angular.module('heremaps-map-modules', [
	'heremaps-events-module',
    'heremaps-ui-module'
]);
},{"./events/events.js":5,"./events/infobubble.js":6,"./ui/ui.js":8}],8:[function(require,module,exports){
module.exports = HereMapsUiFactory;

HereMapsUiFactory.$inject = [
    'HereMapsAPIService',
    'HereMapsMarkerService',
    'HereMapsUtilsService',
    'HereMapsCONSTS'
];
function HereMapsUiFactory(HereMapsAPIService, HereMapsMarkerService, HereMapsUtilsService, HereMapsCONSTS) {
    function UI(platform, alignment) {
        this.map = platform.map;
        this.layers = platform.layers;
        this.alignment = alignment;
        this.ui = platform.ui = H.ui.UI.createDefault(this.map, this.layers);

        this.setupControls();
    }

    UI.isValidAlignment = isValidAlignment;

    var proto = UI.prototype;

    proto.setupControls = setupControls;
    proto.createUserControl = createUserControl;
    proto.setControlsAlignment = setControlsAlignment;

    return {
        start: function(args) {
            if (!(args.platform.map instanceof H.Map) && !(args.platform.layers))
                return console.error('Missed ui module dependencies');

            var ui = new UI(args.platform, args.alignment);
        }
    }

    function setupControls() {
        var NAMES = HereMapsCONSTS.CONTROLS.NAMES,
            userControl = this.createUserControl();

        this.ui.addControl(NAMES.USER, userControl);
        this.setControlsAlignment(NAMES);
    }

    function createUserControl() {
        var self = this,
            userControl = new H.ui.Control(),
            markup = '<svg class="H_icon" fill="#fff" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path class="middle_location_stroke" d="M8 12c-2.206 0-4-1.795-4-4 0-2.206 1.794-4 4-4s4 1.794 4 4c0 2.205-1.794 4-4 4M8 1.25a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5"></path><path class="inner_location_stroke" d="M8 5a3 3 0 1 1 .001 6A3 3 0 0 1 8 5m0-1C5.794 4 4 5.794 4 8c0 2.205 1.794 4 4 4s4-1.795 4-4c0-2.206-1.794-4-4-4"></path><path class="outer_location_stroke" d="M8 1.25a6.75 6.75 0 1 1 0 13.5 6.75 6.75 0 0 1 0-13.5M8 0C3.59 0 0 3.59 0 8c0 4.411 3.59 8 8 8s8-3.589 8-8c0-4.41-3.59-8-8-8"></path></svg>';

        var userControlButton = new H.ui.base.Button({
            label: markup,
            onStateChange: function(evt) {
                if (userControlButton.getState() === H.ui.base.Button.State.DOWN)
                    return;

                HereMapsAPIService.getPosition().then(function(response) {
                    var position = {
                        lng: response.coords.longitude,
                        lat: response.coords.latitude
                    };
                    
                    self.map.setCenter(position);
                    
                    HereMapsUtilsService.zoom(self.map, 17, .08);

                    if (self.userMarker) {
                        self.userMarker.setGeometry(position);
                        return;
                    }
                    
                    self.userMarker = HereMapsMarkerService.addUserMarker(self.map, {
                        pos: position
                    });
                });
            }
        });

        userControl.addChild(userControlButton);

        return userControl;
    }

    function setControlsAlignment(NAMES) {
        if (!UI.isValidAlignment(this.alignment))
            return;

        for (var id in NAMES) {
            var control = this.ui.getControl(NAMES[id]);

            if (!NAMES.hasOwnProperty(id) || !control)
                continue;

            control.setAlignment(this.alignment);
        }
    }

    function isValidAlignment(alignment) {
        return !!(HereMapsCONSTS.CONTROLS.POSITIONS.indexOf(alignment) + 1);
    }

};
},{}],9:[function(require,module,exports){
module.exports = function() {
    var options = {};
    var DEFAULT_API_VERSION = "3.1";

    this.$get = function(){
        return {
            app_id: options.app_id,
            app_code: options.app_code,
            apiKey: options.apiKey,
            apiVersion: options.apiVersion || DEFAULT_API_VERSION,
            useHTTPS: options.useHTTPS,
            useCIT: !!options.useCIT,
            mapTileConfig: options.mapTileConfig
        }
    };

    this.setOptions = function(opts){
        options = opts;
    };
};
},{}],10:[function(require,module,exports){

module.exports = HereMapsUtilsService;

HereMapsUtilsService.$inject = [
    '$rootScope', 
    '$timeout', 
    'HereMapsCONSTS'
];
function HereMapsUtilsService($rootScope, $timeout, HereMapsCONSTS) {
    return {
        throttle: throttle,
        createScriptTag: createScriptTag,
        createLinkTag: createLinkTag,
        runScopeDigestIfNeed: runScopeDigestIfNeed,
        isValidCoords: isValidCoords,
        addEventListener: addEventListener,
        zoom: zoom,
        getBoundsRectFromPoints: getBoundsRectFromPoints,
        generateId: generateId,
        getMapFactory: getMapFactory
    };

    //#region PUBLIC
    function throttle(fn, period) {
        var timeout = null;

        return function () {
            if ($timeout)
                $timeout.cancel(timeout);

            timeout = $timeout(fn, period);
        }
    }

    function addEventListener(obj, eventName, listener, useCapture) {
        obj.addEventListener(eventName, listener, !!useCapture);
    }

    function runScopeDigestIfNeed(scope, cb) {
        if (scope.$root && scope.$root.$$phase !== '$apply' && scope.$root.$$phase !== '$digest') {
            scope.$digest(cb || angular.noop);
            return true;
        }
        return false;
    }

    function createScriptTag(attrs) {
        var script = document.getElementById(attrs.src);

        if (script)
            return false;

        script = document.createElement('script');
        script.type = 'text/javascript';
        script.id = attrs.src;
        _setAttrs(script, attrs);

        return script;
    }

    function createLinkTag(attrs) {
        var link = document.getElementById(attrs.href);

        if (link)
            return false;

        link = document.createElement('link');
        link.id = attrs.href;
        _setAttrs(link, attrs);

        return link;
    }

    function isValidCoords(coords) {
        return coords &&
            (typeof coords.latitude === 'string' || typeof coords.latitude === 'number') &&
            (typeof coords.longitude === 'string' || typeof coords.longitude === 'number')
    }

    function zoom(map, value, step) {
        var currentZoom = map.getZoom(),
            _step = step || HereMapsCONSTS.ANIMATION_ZOOM_STEP,
            factor = currentZoom >= value ? -1 : 1,
            increment = step * factor;

        return (function zoom() {
            if (!step || Math.floor(currentZoom) === Math.floor(value)) {
                map.setZoom(value);
                return;
            }

            currentZoom += increment;
            map.setZoom(currentZoom);

            requestAnimationFrame(zoom);
        })();
    }

    function getMapFactory(){
        return H;
    }

    /**
     * @method getBoundsRectFromPoints
     * 
     * @param {Object} topLeft 
     *  @property {Number|String} lat
     *  @property {Number|String} lng
     * @param {Object} bottomRight 
     *  @property {Number|String} lat
     *  @property {Number|String} lng
     * 
     * @return {H.geo.Rect}
     */
    function getBoundsRectFromPoints(topLeft, bottomRight) {
        return H.geo.Rect.fromPoints(topLeft, bottomRight, true);
    }

    function generateId() {
        var mask = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx',
            regexp = /[xy]/g,
            d = new Date().getTime(),
            uuid = mask.replace(regexp, function (c) {
                var r = (d + Math.random() * 16) % 16 | 0;
                d = Math.floor(d / 16);
                return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });

        return uuid;
    }

    //#endregion PUBLIC 

    function _setAttrs(el, attrs) {
        if (!el || !attrs)
            throw new Error('Missed attributes');

        for (var key in attrs) {
            if (!attrs.hasOwnProperty(key))
                continue;

            el[key] = attrs[key];
        }
    }
};
},{}],11:[function(require,module,exports){
module.exports = HereMapsDefaultMarker;

HereMapsDefaultMarker.$inject = ['HereMapsMarkerInterface'];
function HereMapsDefaultMarker(HereMapsMarkerInterface){
    function DefaultMarker(place){
        this.place = place;
        this.setCoords();
    }

    var proto = DefaultMarker.prototype = new HereMapsMarkerInterface();
    proto.constructor = DefaultMarker;

    proto.create = create;

    return DefaultMarker;
    
    function create(){
        var marker = new H.map.Marker(this.coords);
        
        this.addInfoBubble(marker);
        
        return marker;
    }
}
},{}],12:[function(require,module,exports){
module.exports = HereMapsDOMMarker;

HereMapsDOMMarker.$inject = ['HereMapsMarkerInterface'];
function HereMapsDOMMarker(HereMapsMarkerInterface){
    function DOMMarker(place){
        this.place = place;
        this.setCoords();
    }

    var proto = DOMMarker.prototype = new HereMapsMarkerInterface();
    proto.constructor = DOMMarker;

    proto.create = create;
    proto.getIcon = getIcon;
    proto.setupEvents = setupEvents;

    return DOMMarker;
    
    function create(){
        var marker = new H.map.DomMarker(this.coords, {
            icon: this.getIcon()
        });
        
        this.addInfoBubble(marker);
        
        return marker;
    }
    
    function getIcon(){
        var icon = this.place.markup;
         if(!icon)
            throw new Error('markup missed');

        return new H.map.DomIcon(icon);
    }
    
    function setupEvents(el, events, remove){
        var method = remove ? 'removeEventListener' : 'addEventListener';

        for(var key in events) {
            if(!events.hasOwnProperty(key))
                continue;

            el[method].call(null, key, events[key]);
        }
    }
}
},{}],13:[function(require,module,exports){
module.exports = angular.module('heremaps-markers-module', [])
    .factory('HereMapsMarkerInterface', require('./marker.js'))
    .factory('HereMapsDefaultMarker', require('./default.marker.js'))
    .factory('HereMapsDOMMarker', require('./dom.marker.js'))
    .factory('HereMapsSVGMarker', require('./svg.marker.js'))
    .service('HereMapsMarkerService', require('./markers.service.js'));
},{"./default.marker.js":11,"./dom.marker.js":12,"./marker.js":14,"./markers.service.js":15,"./svg.marker.js":16}],14:[function(require,module,exports){
module.exports = function(){
    function MarkerInterface(){
        throw new Error('Abstract class! The Instance should be created');
    }
    
    var proto = MarkerInterface.prototype;
    
    proto.create = create;
    proto.setCoords = setCoords;
    proto.addInfoBubble = addInfoBubble;
    
    function Marker(){}
    
    Marker.prototype = proto;
    
    return Marker;
    
    function create(){
        throw new Error('create:: not implemented'); 
    }
    
    function setCoords(){
         this.coords = {
            lat: this.place.pos.lat,
            lng: this.place.pos.lng
        }
    }
    
    function addInfoBubble(marker){
        if(!this.place.popup)
            return;
            
        marker.setData(this.place.popup)
    }
}
},{}],15:[function(require,module,exports){
module.exports = HereMapsMarkerService;

HereMapsMarkerService.$inject = [
    'HereMapsDefaultMarker',
    'HereMapsDOMMarker',
    'HereMapsSVGMarker',
    'HereMapsCONSTS'
];
function HereMapsMarkerService(HereMapsDefaultMarker, HereMapsDOMMarker, HereMapsSVGMarker, HereMapsCONSTS) {
    var MARKER_TYPES = HereMapsCONSTS.MARKER_TYPES;

    return {
        addMarkersToMap: addMarkersToMap,
        addUserMarker: addUserMarker,
        updateMarkers: updateMarkers,
        isMarkerInstance: isMarkerInstance,
        setViewBounds: setViewBounds
    }

    function isMarkerInstance(target) {
        return target instanceof H.map.Marker || target instanceof H.map.DomMarker;
    }

    function addUserMarker(map, place) {
        if (map.userMarker)
            return map.userMarker;

        place.markup = '<svg width="35px" height="35px" viewBox="0 0 90 90" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
            '<defs><circle id="path-1" cx="302" cy="802" r="15"></circle>' +
            '<mask id="mask-2" maskContentUnits="userSpaceOnUse" maskUnits="objectBoundingBox" x="-30" y="-30" width="90" height="90">' +
            '<rect x="257" y="757" width="90" height="90" fill="white"></rect><use xlink:href="#path-1" fill="black"></use>' +
            '</mask></defs><g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">' +
            '<g id="Service-Options---directions---map" transform="translate(-257.000000, -757.000000)"><g id="Oval-15">' +
            '<use fill="#FFFFFF" fill-rule="evenodd" xlink:href="#path-1"></use>' +
            '<use stroke-opacity="0.29613904" stroke="#3F34A0" mask="url(#mask-2)" stroke-width="60" xlink:href="#path-1"></use>' +
            '<use stroke="#3F34A0" stroke-width="5" xlink:href="#path-1"></use></g></g></g></svg>';

        map.userMarker = new HereMapsSVGMarker(place).create();

        map.addObject(map.userMarker);

        return map.userMarker;
    }

    function addMarkersToMap(map, places, refreshViewbounds) {
        if (!places || !places.length)
            return;

        if (!(map instanceof H.Map))
            throw new Error('Unsupported map instance');

        if (!map.markersGroup)
            map.markersGroup = new H.map.Group();

        places.forEach(function (place, i) {
            var creator = _getMarkerCreator(place),
                marker = place.draggable ? _draggableMarkerMixin(creator.create()) : creator.create();

            map.markersGroup.addObject(marker);
        });

        map.addObject(map.markersGroup);

        if (refreshViewbounds) {
            setViewBounds(map, map.markersGroup.getBoundingBox());
        }
    }

    function setViewBounds(map, bounds, opt_animate) {
        map.getViewModel().setLookAtData(bounds, !!opt_animate);
    }

    function updateMarkers(map, places, refreshViewbounds) {
        if (map.markersGroup) {
            map.markersGroup.removeAll();
            map.removeObject(map.markersGroup);
            map.markersGroup = null;
        }

        addMarkersToMap.apply(null, arguments);
    }

    function _getMarkerCreator(place) {
        var ConcreteMarker,
            type = place.type ? place.type.toUpperCase() : null;

        switch (type) {
            case MARKER_TYPES.DOM:
                ConcreteMarker = HereMapsDOMMarker;
                break;
            case MARKER_TYPES.SVG:
                ConcreteMarker = HereMapsSVGMarker;
                break;
            default:
                ConcreteMarker = HereMapsDefaultMarker;
        }

        return new ConcreteMarker(place);
    }

    function _draggableMarkerMixin(marker) {
        marker.draggable = true;

        return marker;
    }
};

},{}],16:[function(require,module,exports){
module.exports = HereMapsSVGMarker;

HereMapsSVGMarker.$inject = ['HereMapsMarkerInterface'];
function HereMapsSVGMarker(HereMapsMarkerInterface){
    function SVGMarker(place){
        this.place = place;
        this.setCoords();
    }
    
    var proto = SVGMarker.prototype = new HereMapsMarkerInterface();
    proto.constructor = SVGMarker;
    
    proto.create = create;
    proto.getIcon = getIcon;
    
    return SVGMarker;
    
    function create(){
        var marker = new H.map.Marker(this.coords, {
            icon: this.getIcon(),
        });
        
        this.addInfoBubble(marker);
        
        return marker;
    }
    
    function getIcon(){
        var icon = this.place.markup;
         if(!icon)
            throw new Error('markup missed');

        return new H.map.Icon(icon);
    }
}
},{}],17:[function(require,module,exports){
module.exports = angular.module('heremaps-routes-module', [])
                    .service('HereMapsRoutesService', require('./routes.service.js'));  
},{"./routes.service.js":18}],18:[function(require,module,exports){
module.exports = HereMapsRoutesService;

HereMapsRoutesService.$inject = ['$q', 'HereMapsMarkerService'];
function HereMapsRoutesService($q, HereMapsMarkerService) {
    return {
        calculateRoute: calculateRoute,
        addRouteToMap: addRouteToMap,
        cleanRoutes: cleanRoutes
    }

    function calculateRoute(heremaps, config) {
        var platform = heremaps.platform,
            map = heremaps.map,
            router = platform.getRoutingService(),
            dir = config.direction,
            waypoints = dir.waypoints;

        var mode = '{{MODE}};{{VECHILE}}'
            .replace(/{{MODE}}/, dir.mode || 'fastest')
            .replace(/{{VECHILE}}/, config.driveType);

        var routeRequestParams = {
            mode: mode,
            representation: dir.representation || 'display',
            language: dir.language || 'en-gb'
        };

        waypoints.forEach(function (waypoint, i) {
            routeRequestParams["waypoint" + i] = [waypoint.lat, waypoint.lng].join(',');
        });

        _setAttributes(routeRequestParams, dir.attrs);

        var deferred = $q.defer();

        router.calculateRoute(routeRequestParams, function (result) {
            deferred.resolve(result);
        }, function (error) {
            deferred.reject(error);
        });

        return deferred.promise;
    }

    function cleanRoutes(map) {
        var group = map.routesGroup;

        if (!group)
            return;

        group.removeAll();
        map.removeObject(group);
        map.routesGroup = null;
    }

    function addRouteToMap(map, routeData, clean) {
        if (clean)
            cleanRoutes(map);

        var route = routeData.route;

        if (!map || !route || !route.shape)
            return;

        var strip = new H.geo.LineString(), polyline = null;

        route.shape.forEach(function (point) {
            var parts = point.split(',');
            strip.pushLatLngAlt(parts[0], parts[1]);
        });

        var style = routeData.style || {};

        polyline = new H.map.Polyline(strip, {
            style: {
                lineWidth: style.lineWidth || 4,
                strokeColor: style.color || 'rgba(0, 128, 255, 0.7)'
            }
        });

        var group = map.routesGroup;

        if (!group) {
            group = map.routesGroup = new H.map.Group();
            map.addObject(group);
        }

        group.addObject(polyline);

        if(routeData.zoomToBounds) {
            HereMapsMarkerService.setViewBounds(map, polyline.getBoundingBox(), true);
        }
    }

    //#region PRIVATE

    function _setAttributes(params, attrs) {
        var _key = 'attributes';
        for (var key in attrs) {
            if (!attrs.hasOwnProperty(key))
                continue;

            params[key + _key] = attrs[key];
        }
    }

    /**
     * Creates a series of H.map.Marker points from the route and adds them to the map.
     * @param {Object} route  A route as received from the H.service.RoutingService
     */
    function addManueversToMap(map, route) {
        var svgMarkup = '<svg width="18" height="18" ' +
            'xmlns="http://www.w3.org/2000/svg">' +
            '<circle cx="8" cy="8" r="8" ' +
            'fill="#1b468d" stroke="white" stroke-width="1"  />' +
            '</svg>',
            dotIcon = new H.map.Icon(svgMarkup, { anchor: { x: 8, y: 8 } }),
            group = new H.map.Group(), i, j;

        // Add a marker for each maneuver
        for (i = 0; i < route.leg.length; i += 1) {
            for (j = 0; j < route.leg[i].maneuver.length; j += 1) {
                // Get the next maneuver.
                maneuver = route.leg[i].maneuver[j];
                // Add a marker to the maneuvers group
                var marker = new H.map.Marker({
                    lat: maneuver.position.latitude,
                    lng: maneuver.position.longitude
                },
                    { icon: dotIcon }
                );

                marker.instruction = maneuver.instruction;
                group.addObject(marker);
            }
        }

        group.addEventListener('tap', function (evt) {
            map.setCenter(evt.target.getPosition());
            openBubble(evt.target.getPosition(), evt.target.instruction);
        }, false);

        // Add the maneuvers group to the map
        map.addObject(group);
    }


    /**
     * Creates a series of H.map.Marker points from the route and adds them to the map.
     * @param {Object} route  A route as received from the H.service.RoutingService
     */
    function addWaypointsToPanel(waypoints) {
        var nodeH3 = document.createElement('h3'),
            waypointLabels = [],
            i;

        for (i = 0; i < waypoints.length; i += 1) {
            waypointLabels.push(waypoints[i].label)
        }

        nodeH3.textContent = waypointLabels.join(' - ');

        routeInstructionsContainer.innerHTML = '';
        routeInstructionsContainer.appendChild(nodeH3);
    }

    /**
     * Creates a series of H.map.Marker points from the route and adds them to the map.
     * @param {Object} route  A route as received from the H.service.RoutingService
     */
    function addSummaryToPanel(summary) {
        var summaryDiv = document.createElement('div'),
            content = '';

        content += '<b>Total distance</b>: ' + summary.distance + 'm. <br/>';
        content += '<b>Travel Time</b>: ' + summary.travelTime.toMMSS() + ' (in current traffic)';


        summaryDiv.style.fontSize = 'small';
        summaryDiv.style.marginLeft = '5%';
        summaryDiv.style.marginRight = '5%';
        summaryDiv.innerHTML = content;
        routeInstructionsContainer.appendChild(summaryDiv);
    }

    /**
     * Creates a series of H.map.Marker points from the route and adds them to the map.
     * @param {Object} route  A route as received from the H.service.RoutingService
     */
    function addManueversToPanel(route) {
        var nodeOL = document.createElement('ol'), i, j;

        nodeOL.style.fontSize = 'small';
        nodeOL.style.marginLeft = '5%';
        nodeOL.style.marginRight = '5%';
        nodeOL.className = 'directions';

        // Add a marker for each maneuver
        for (i = 0; i < route.leg.length; i += 1) {
            for (j = 0; j < route.leg[i].maneuver.length; j += 1) {
                // Get the next maneuver.
                maneuver = route.leg[i].maneuver[j];

                var li = document.createElement('li'),
                    spanArrow = document.createElement('span'),
                    spanInstruction = document.createElement('span');

                spanArrow.className = 'arrow ' + maneuver.action;
                spanInstruction.innerHTML = maneuver.instruction;
                li.appendChild(spanArrow);
                li.appendChild(spanInstruction);

                nodeOL.appendChild(li);
            }
        }

        routeInstructionsContainer.appendChild(nodeOL);
    }

};

},{}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvaGVyZW1hcHMuZGlyZWN0aXZlLmpzIiwic3JjL2luZGV4LmpzIiwic3JjL3Byb3ZpZGVycy9hcGkuc2VydmljZS5qcyIsInNyYy9wcm92aWRlcnMvY29uc3RzLmpzIiwic3JjL3Byb3ZpZGVycy9tYXAtbW9kdWxlcy9ldmVudHMvZXZlbnRzLmpzIiwic3JjL3Byb3ZpZGVycy9tYXAtbW9kdWxlcy9ldmVudHMvaW5mb2J1YmJsZS5qcyIsInNyYy9wcm92aWRlcnMvbWFwLW1vZHVsZXMvaW5kZXguanMiLCJzcmMvcHJvdmlkZXJzL21hcC1tb2R1bGVzL3VpL3VpLmpzIiwic3JjL3Byb3ZpZGVycy9tYXBjb25maWcucHJvdmlkZXIuanMiLCJzcmMvcHJvdmlkZXJzL21hcHV0aWxzLnNlcnZpY2UuanMiLCJzcmMvcHJvdmlkZXJzL21hcmtlcnMvZGVmYXVsdC5tYXJrZXIuanMiLCJzcmMvcHJvdmlkZXJzL21hcmtlcnMvZG9tLm1hcmtlci5qcyIsInNyYy9wcm92aWRlcnMvbWFya2Vycy9pbmRleC5qcyIsInNyYy9wcm92aWRlcnMvbWFya2Vycy9tYXJrZXIuanMiLCJzcmMvcHJvdmlkZXJzL21hcmtlcnMvbWFya2Vycy5zZXJ2aWNlLmpzIiwic3JjL3Byb3ZpZGVycy9tYXJrZXJzL3N2Zy5tYXJrZXIuanMiLCJzcmMvcHJvdmlkZXJzL3JvdXRlcy9pbmRleC5qcyIsInNyYy9wcm92aWRlcnMvcm91dGVzL3JvdXRlcy5zZXJ2aWNlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM1VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25HQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc0RpcmVjdGl2ZTtcblxuSGVyZU1hcHNEaXJlY3RpdmUuJGluamVjdCA9IFtcbiAgICAnJHRpbWVvdXQnLFxuICAgICckd2luZG93JyxcbiAgICAnJHJvb3RTY29wZScsXG4gICAgJyRmaWx0ZXInLFxuICAgICdIZXJlTWFwc0NvbmZpZycsXG4gICAgJ0hlcmVNYXBzQVBJU2VydmljZScsXG4gICAgJ0hlcmVNYXBzVXRpbHNTZXJ2aWNlJyxcbiAgICAnSGVyZU1hcHNNYXJrZXJTZXJ2aWNlJyxcbiAgICAnSGVyZU1hcHNSb3V0ZXNTZXJ2aWNlJyxcbiAgICAnSGVyZU1hcHNDT05TVFMnLFxuICAgICdIZXJlTWFwc0V2ZW50c0ZhY3RvcnknLFxuICAgICdIZXJlTWFwc1VpRmFjdG9yeSdcbl07XG5mdW5jdGlvbiBIZXJlTWFwc0RpcmVjdGl2ZShcbiAgICAkdGltZW91dCxcbiAgICAkd2luZG93LFxuICAgICRyb290U2NvcGUsXG4gICAgJGZpbHRlcixcbiAgICBIZXJlTWFwc0NvbmZpZyxcbiAgICBIZXJlTWFwc0FQSVNlcnZpY2UsXG4gICAgSGVyZU1hcHNVdGlsc1NlcnZpY2UsXG4gICAgSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLFxuICAgIEhlcmVNYXBzUm91dGVzU2VydmljZSxcbiAgICBIZXJlTWFwc0NPTlNUUyxcbiAgICBIZXJlTWFwc0V2ZW50c0ZhY3RvcnksXG4gICAgSGVyZU1hcHNVaUZhY3RvcnkpIHtcblxuICAgIEhlcmVNYXBzRGlyZWN0aXZlQ3RybC4kaW5qZWN0ID0gWyckc2NvcGUnLCAnJGVsZW1lbnQnLCAnJGF0dHJzJ107XG5cbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0VBJyxcbiAgICAgICAgdGVtcGxhdGU6IFwiPGRpdiBuZy1zdHlsZT1cXFwieyd3aWR0aCc6IG1hcFdpZHRoLCAnaGVpZ2h0JzogbWFwSGVpZ2h0fVxcXCI+PC9kaXY+XCIsXG4gICAgICAgIHJlcGxhY2U6IHRydWUsXG4gICAgICAgIHNjb3BlOiB7XG4gICAgICAgICAgICBvcHRzOiAnJm9wdGlvbnMnLFxuICAgICAgICAgICAgcGxhY2VzOiAnJicsXG4gICAgICAgICAgICBvbk1hcFJlYWR5OiBcIiZtYXBSZWFkeVwiLFxuICAgICAgICAgICAgZXZlbnRzOiAnJidcbiAgICAgICAgfSxcbiAgICAgICAgY29udHJvbGxlcjogSGVyZU1hcHNEaXJlY3RpdmVDdHJsXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gSGVyZU1hcHNEaXJlY3RpdmVDdHJsKCRzY29wZSwgJGVsZW1lbnQsICRhdHRycykge1xuICAgICAgICB2YXIgQ09OVFJPTF9OQU1FUyA9IEhlcmVNYXBzQ09OU1RTLkNPTlRST0xTLk5BTUVTLFxuICAgICAgICAgICAgcGxhY2VzID0gJHNjb3BlLnBsYWNlcygpLFxuICAgICAgICAgICAgb3B0cyA9ICRzY29wZS5vcHRzKCksXG4gICAgICAgICAgICBsaXN0ZW5lcnMgPSAkc2NvcGUuZXZlbnRzKCk7XG5cbiAgICAgICAgdmFyIG9wdGlvbnMgPSBhbmd1bGFyLmV4dGVuZCh7fSwgSGVyZU1hcHNDT05TVFMuREVGQVVMVF9NQVBfT1BUSU9OUywgb3B0cyksXG4gICAgICAgICAgICBwb3NpdGlvbiA9IEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmlzVmFsaWRDb29yZHMob3B0aW9ucy5jb29yZHMpID9cbiAgICAgICAgICAgICAgICBvcHRpb25zLmNvb3JkcyA6IEhlcmVNYXBzQ09OU1RTLkRFRkFVTFRfTUFQX09QVElPTlMuY29vcmRzO1xuXG4gICAgICAgIHZhciBoZXJlbWFwcyA9IHsgaWQ6IEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmdlbmVyYXRlSWQoKSB9LFxuICAgICAgICAgICAgbWFwUmVhZHkgPSAkc2NvcGUub25NYXBSZWFkeSgpLFxuICAgICAgICAgICAgX29uUmVzaXplTWFwID0gbnVsbDtcblxuICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gX3NldE1hcFNpemUoKTtcbiAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBIZXJlTWFwc0FQSVNlcnZpY2UubG9hZEFwaSgpLnRoZW4oX2FwaVJlYWR5KS5jYXRjaChmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBvcHRpb25zLnJlc2l6ZSAmJiBhZGRPblJlc2l6ZUxpc3RlbmVyKCk7XG5cbiAgICAgICAgJHNjb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIF9vblJlc2l6ZU1hcCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZ1bmN0aW9uIGFkZE9uUmVzaXplTGlzdGVuZXIoKSB7XG4gICAgICAgICAgICBfb25SZXNpemVNYXAgPSBIZXJlTWFwc1V0aWxzU2VydmljZS50aHJvdHRsZShfcmVzaXplSGFuZGxlciwgSGVyZU1hcHNDT05TVFMuVVBEQVRFX01BUF9SRVNJWkVfVElNRU9VVCk7XG4gICAgICAgICAgICAkd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIF9vblJlc2l6ZU1hcCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBfYXBpUmVhZHkoKSB7XG4gICAgICAgICAgICBfc2V0dXBNYXBQbGF0Zm9ybSgpO1xuICAgICAgICAgICAgX3NldHVwTWFwKCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBfc2V0dXBNYXBQbGF0Zm9ybSgpIHtcbiAgICAgICAgICAgIGlmICghSGVyZU1hcHNDb25maWcuYXBwX2lkIHx8ICghSGVyZU1hcHNDb25maWcuYXBwX2NvZGUgJiYgIUhlcmVNYXBzQ29uZmlnLmFwaUtleSkpXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdhcHBfaWQgb3IgZWl0aGVyIG9mIGFwcF9jb2RlIGFuZCBhcGlLZXkgd2VyZSBtaXNzZWQuIFBsZWFzZSBzcGVjaWZ5IHRoZWlyIGluIEhlcmVNYXBzQ29uZmlnJyk7XG5cbiAgICAgICAgICAgIGhlcmVtYXBzLnBsYXRmb3JtID0gbmV3IEguc2VydmljZS5QbGF0Zm9ybShIZXJlTWFwc0NvbmZpZyk7XG4gICAgICAgICAgICBoZXJlbWFwcy5sYXllcnMgPSBoZXJlbWFwcy5wbGF0Zm9ybS5jcmVhdGVEZWZhdWx0TGF5ZXJzKCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBfZ2V0TG9jYXRpb24oZW5hYmxlSGlnaEFjY3VyYWN5LCBtYXhpbXVtQWdlKSB7XG4gICAgICAgICAgICB2YXIgX2VuYWJsZUhpZ2hBY2N1cmFjeSA9ICEhZW5hYmxlSGlnaEFjY3VyYWN5LFxuICAgICAgICAgICAgICAgIF9tYXhpbXVtQWdlID0gbWF4aW11bUFnZSB8fCAwO1xuXG4gICAgICAgICAgICByZXR1cm4gSGVyZU1hcHNBUElTZXJ2aWNlLmdldFBvc2l0aW9uKHtcbiAgICAgICAgICAgICAgICBlbmFibGVIaWdoQWNjdXJhY3k6IF9lbmFibGVIaWdoQWNjdXJhY3ksXG4gICAgICAgICAgICAgICAgbWF4aW11bUFnZTogX21heGltdW1BZ2VcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gX2xvY2F0aW9uRmFpbHVyZSgpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0NhbiBub3QgZ2V0IGEgZ2VvIHBvc2l0aW9uJyk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBfc2V0dXBNYXAoKSB7XG4gICAgICAgICAgICBfaW5pdE1hcChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgSGVyZU1hcHNBUElTZXJ2aWNlLmxvYWRNb2R1bGVzKCRhdHRycy4kYXR0ciwge1xuICAgICAgICAgICAgICAgICAgICBcImNvbnRyb2xzXCI6IF91aU1vZHVsZVJlYWR5LFxuICAgICAgICAgICAgICAgICAgICBcImV2ZW50c1wiOiBfZXZlbnRzTW9kdWxlUmVhZHlcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gX2luaXRNYXAoY2IpIHtcbiAgICAgICAgICAgIHZhciBtYXAgPSBoZXJlbWFwcy5tYXAgPSBuZXcgSC5NYXAoJGVsZW1lbnRbMF0sIGhlcmVtYXBzLmxheWVycy52ZWN0b3Iubm9ybWFsLm1hcCwge1xuICAgICAgICAgICAgICAgIHpvb206IEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmlzVmFsaWRDb29yZHMocG9zaXRpb24pID8gb3B0aW9ucy56b29tIDogb3B0aW9ucy5tYXhab29tLFxuICAgICAgICAgICAgICAgIGNlbnRlcjogbmV3IEguZ2VvLlBvaW50KHBvc2l0aW9uLmxhdGl0dWRlLCBwb3NpdGlvbi5sb25naXR1ZGUpXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLmFkZE1hcmtlcnNUb01hcChtYXAsIHBsYWNlcywgdHJ1ZSk7XG5cbiAgICAgICAgICAgIGlmIChIZXJlTWFwc0NvbmZpZy5tYXBUaWxlQ29uZmlnKVxuICAgICAgICAgICAgICAgIF9zZXRDdXN0b21NYXBTdHlsZXMobWFwLCBIZXJlTWFwc0NvbmZpZy5tYXBUaWxlQ29uZmlnKTtcblxuICAgICAgICAgICAgbWFwUmVhZHkgJiYgbWFwUmVhZHkoTWFwUHJveHkoKSk7XG5cbiAgICAgICAgICAgIGNiICYmIGNiKCk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIF91aU1vZHVsZVJlYWR5KCkge1xuICAgICAgICAgICAgSGVyZU1hcHNVaUZhY3Rvcnkuc3RhcnQoe1xuICAgICAgICAgICAgICAgIHBsYXRmb3JtOiBoZXJlbWFwcyxcbiAgICAgICAgICAgICAgICBhbGlnbm1lbnQ6ICRhdHRycy5jb250cm9sc1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBfZXZlbnRzTW9kdWxlUmVhZHkoKSB7XG4gICAgICAgICAgICBIZXJlTWFwc0V2ZW50c0ZhY3Rvcnkuc3RhcnQoe1xuICAgICAgICAgICAgICAgIHBsYXRmb3JtOiBoZXJlbWFwcyxcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnM6IGxpc3RlbmVycyxcbiAgICAgICAgICAgICAgICBvcHRpb25zOiBvcHRpb25zLFxuICAgICAgICAgICAgICAgIGluamVjdG9yOiBfbW9kdWxlSW5qZWN0b3JcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gX21vZHVsZUluamVjdG9yKCkge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChpZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBoZXJlbWFwc1tpZF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBfcmVzaXplSGFuZGxlcihoZWlnaHQsIHdpZHRoKSB7XG4gICAgICAgICAgICBfc2V0TWFwU2l6ZS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuXG4gICAgICAgICAgICBoZXJlbWFwcy5tYXAuZ2V0Vmlld1BvcnQoKS5yZXNpemUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIF9zZXRNYXBTaXplKGhlaWdodCwgd2lkdGgpIHtcbiAgICAgICAgICAgIHZhciBoZWlnaHQgPSBoZWlnaHQgfHwgJGVsZW1lbnRbMF0ucGFyZW50Tm9kZS5vZmZzZXRIZWlnaHQgfHwgb3B0aW9ucy5oZWlnaHQsXG4gICAgICAgICAgICAgICAgd2lkdGggPSB3aWR0aCB8fCAkZWxlbWVudFswXS5wYXJlbnROb2RlLm9mZnNldFdpZHRoIHx8IG9wdGlvbnMud2lkdGg7XG5cbiAgICAgICAgICAgICRzY29wZS5tYXBIZWlnaHQgPSBoZWlnaHQgKyAncHgnO1xuICAgICAgICAgICAgJHNjb3BlLm1hcFdpZHRoID0gd2lkdGggKyAncHgnO1xuXG4gICAgICAgICAgICBIZXJlTWFwc1V0aWxzU2VydmljZS5ydW5TY29wZURpZ2VzdElmTmVlZCgkc2NvcGUpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmdW5jdGlvbiBfc2V0Q3VzdG9tTWFwU3R5bGVzKG1hcCwgY29uZmlnKSB7XG4gICAgICAgICAgICAvLyBDcmVhdGUgYSBNYXBUaWxlU2VydmljZSBpbnN0YW5jZSB0byByZXF1ZXN0IGJhc2UgdGlsZXMgKGkuZS4gYmFzZS5tYXAuYXBpLmhlcmUuY29tKTpcbiAgICAgICAgICAgIC8vIHZhciBtYXBUaWxlU2VydmljZSA9IGhlcmVtYXBzLnBsYXRmb3JtLmdldE1hcFRpbGVTZXJ2aWNlKHsgJ3R5cGUnOiAnYmFzZScgfSk7XG4gICAgICAgICAgICB2YXIgcmFzdGVyVGlsZVNlcnZpY2UgPSBoZXJlbWFwcy5wbGF0Zm9ybS5nZXRSYXN0ZXJUaWxlU2VydmljZSh7XG4gICAgICAgICAgICAgICAgZm9ybWF0OiBjb25maWcuZm9ybWF0IHx8ICdwbmcnLCBcbiAgICAgICAgICAgICAgICBxdWVyeVBhcmFtczoge1xuICAgICAgICAgICAgICAgICAgICBsYW5nOiAnZW4nLFxuICAgICAgICAgICAgICAgICAgICBwcGk6ICBjb25maWcucHBpIHx8IDQwMCxcbiAgICAgICAgICAgICAgICAgICAgc3R5bGU6IGNvbmZpZy5zdHlsZSB8fCAnZXhwbG9yZS5kYXknLFxuICAgICAgICAgICAgICAgICAgICBjb25nZXN0aW9uOiBjb25maWcuY29uZ2VzdGlvbiB8fCAndHJ1ZScsXG4gICAgICAgICAgICAgICAgICAgIGZlYXR1cmVzOiBjb25maWcuZmVhdHVyZXMgfHwgJ3BvaXM6YWxsLGVudmlyb25tZW50YWxfem9uZXM6YWxsLGNvbmdlc3Rpb25fem9uZXM6YWxsLHZlaGljbGVfcmVzdHJpY3Rpb25zOmFjdGl2ZV9hbmRfaW5hY3RpdmUnXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBDcmVhdGUgYSB0aWxlIGxheWVyIHdoaWNoIHJlcXVlc3RzIG1hcCB0aWxlc1xuICAgICAgICAgICAgLy8gdmFyIG5ld1N0eWxlTGF5ZXIgPSBtYXBUaWxlU2VydmljZS5jcmVhdGVUaWxlTGF5ZXIoXG4gICAgICAgICAgICAvLyAgICAgJ21hcHRpbGUnLCBcbiAgICAgICAgICAgIC8vICAgICBjb25maWcuc2NoZW1lIHx8ICdub3JtYWwuZGF5JywgXG4gICAgICAgICAgICAvLyAgICAgY29uZmlnLnNpemUgfHwgMjU2LCBcbiAgICAgICAgICAgIC8vICAgICBjb25maWcuZm9ybWF0IHx8ICdwbmc4JywgXG4gICAgICAgICAgICAvLyAgICAgY29uZmlnLm1ldGFkYXRhUXVlcnlQYXJhbXMgfHwge31cbiAgICAgICAgICAgIC8vICk7XG4gICAgICAgICAgICB2YXIgcmFzdGVyVGlsZVByb3ZpZGVyID0gbmV3IEguc2VydmljZS5yYXN0ZXJUaWxlLlByb3ZpZGVyKHJhc3RlclRpbGVTZXJ2aWNlLCB7XG4gICAgICAgICAgICAgICAgLy8gZW5naW5lVHlwZTogSC5NYXAuRW5naW5lVHlwZS5IQVJQLFxuICAgICAgICAgICAgICAgIHRpbGVTaXplOiA1MTJcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2YXIgbmV3U3R5bGVMYXllciA9IG5ldyBILm1hcC5sYXllci5UaWxlTGF5ZXIocmFzdGVyVGlsZVByb3ZpZGVyKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gU2V0IG5ldyBzdHlsZSBsYXllciBhcyBhIGJhc2UgbGF5ZXIgb24gdGhlIG1hcDpcbiAgICAgICAgICAgIG1hcC5zZXRCYXNlTGF5ZXIobmV3U3R5bGVMYXllcik7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBNYXBQcm94eSgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgcmVmcmVzaDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY3VycmVudEJvdW5kcyA9IHRoaXMuZ2V0Vmlld0JvdW5kcygpO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0TWFwU2l6ZXMoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRWaWV3Qm91bmRzKGN1cnJlbnRCb3VuZHMpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0TWFwU2l6ZXM6IGZ1bmN0aW9uIChoZWlnaHQsIHdpZHRoKSB7XG4gICAgICAgICAgICAgICAgICAgIF9yZXNpemVIYW5kbGVyLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBnZXRQbGF0Zm9ybTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGVyZW1hcHM7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBjYWxjdWxhdGVSb3V0ZTogZnVuY3Rpb24gKGRyaXZlVHlwZSwgZGlyZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBIZXJlTWFwc1JvdXRlc1NlcnZpY2UuY2FsY3VsYXRlUm91dGUoaGVyZW1hcHMsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRyaXZlVHlwZTogZHJpdmVUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGlyZWN0aW9uOiBkaXJlY3Rpb25cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBhZGRSb3V0ZVRvTWFwOiBmdW5jdGlvbiAocm91dGVEYXRhLCBjbGVhbikge1xuICAgICAgICAgICAgICAgICAgICBIZXJlTWFwc1JvdXRlc1NlcnZpY2UuYWRkUm91dGVUb01hcChoZXJlbWFwcy5tYXAsIHJvdXRlRGF0YSwgY2xlYW4pO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0Wm9vbTogZnVuY3Rpb24gKHpvb20sIHN0ZXApIHtcbiAgICAgICAgICAgICAgICAgICAgSGVyZU1hcHNVdGlsc1NlcnZpY2Uuem9vbShoZXJlbWFwcy5tYXAsIHpvb20gfHwgMTAsIHN0ZXApO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgZ2V0Wm9vbTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGVyZW1hcHMubWFwLmdldFpvb20oKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGdldENlbnRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGVyZW1hcHMubWFwLmdldENlbnRlcigpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgZ2V0Vmlld0JvdW5kczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGVyZW1hcHMubWFwLmdldFZpZXdCb3VuZHMoKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHNldFZpZXdCb3VuZHM6IGZ1bmN0aW9uIChib3VuZGluZ1JlY3QsIG9wdF9hbmltYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIEhlcmVNYXBzTWFya2VyU2VydmljZS5zZXRWaWV3Qm91bmRzKGhlcmVtYXBzLm1hcCwgYm91bmRpbmdSZWN0LCBvcHRfYW5pbWF0ZSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBnZXRCb3VuZHNSZWN0RnJvbVBvaW50czogZnVuY3Rpb24gKHRvcExlZnQsIGJvdHRvbVJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBIZXJlTWFwc1V0aWxzU2VydmljZS5nZXRCb3VuZHNSZWN0RnJvbVBvaW50cy5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0Q2VudGVyOiBmdW5jdGlvbiAoY29vcmRzLCBvcHRfYW5pbWF0ZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWNvb3Jkcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ2Nvb3JkcyBhcmUgbm90IHNwZWNpZmllZCEnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGhlcmVtYXBzLm1hcC5zZXRDZW50ZXIoY29vcmRzLCBvcHRfYW5pbWF0ZSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBjbGVhblJvdXRlczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBIZXJlTWFwc1JvdXRlc1NlcnZpY2UuY2xlYW5Sb3V0ZXMoaGVyZW1hcHMubWFwKTtcbiAgICAgICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgICAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVIaWdoQWNjdXJhY3lcbiAgICAgICAgICAgICAgICAgKiBAcGFyYW0ge051bWJlcn0gbWF4aW11bUFnZSAtIHRoZSBtYXhpbXVtIGFnZSBpbiBtaWxsaXNlY29uZHMgb2YgYSBwb3NzaWJsZSBjYWNoZWQgcG9zaXRpb24gdGhhdCBpcyBhY2NlcHRhYmxlIHRvIHJldHVybi4gSWYgc2V0IHRvIDAsIGl0IG1lYW5zIHRoYXQgdGhlIGRldmljZSBjYW5ub3QgdXNlIGEgY2FjaGVkIHBvc2l0aW9uIGFuZCBtdXN0IGF0dGVtcHQgdG8gcmV0cmlldmUgdGhlIHJlYWwgY3VycmVudCBwb3NpdGlvblxuICAgICAgICAgICAgICAgICAqIEByZXR1cm4ge1Byb21pc2V9XG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgZ2V0VXNlckxvY2F0aW9uOiBmdW5jdGlvbiAoZW5hYmxlSGlnaEFjY3VyYWN5LCBtYXhpbXVtQWdlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBfZ2V0TG9jYXRpb24uYXBwbHkobnVsbCwgYXJndW1lbnRzKS50aGVuKGZ1bmN0aW9uIChwb3NpdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNvb3JkcyA9IHBvc2l0aW9uLmNvb3JkcztcblxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXQ6IGNvb3Jkcy5sYXRpdHVkZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsbmc6IGNvb3Jkcy5sb25naXR1ZGVcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBnZW9jb2RlUG9zaXRpb246IGZ1bmN0aW9uIChjb29yZHMsIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEhlcmVNYXBzQVBJU2VydmljZS5nZW9jb2RlUG9zaXRpb24oaGVyZW1hcHMucGxhdGZvcm0sIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvb3JkczogY29vcmRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmFkaXVzOiBvcHRpb25zICYmIG9wdGlvbnMucmFkaXVzLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGFuZzogb3B0aW9ucyAmJiBvcHRpb25zLmxhbmdcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBnZW9jb2RlQWRkcmVzczogZnVuY3Rpb24gKGFkZHJlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEhlcmVNYXBzQVBJU2VydmljZS5nZW9jb2RlQWRkcmVzcyhoZXJlbWFwcy5wbGF0Zm9ybSwge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VhcmNodGV4dDogYWRkcmVzcyAmJiBhZGRyZXNzLnNlYXJjaHRleHQsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb3VudHJ5OiBhZGRyZXNzICYmIGFkZHJlc3MuY291bnRyeSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNpdHk6IGFkZHJlc3MgJiYgYWRkcmVzcy5jaXR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RyZWV0OiBhZGRyZXNzICYmIGFkZHJlc3Muc3RyZWV0LFxuICAgICAgICAgICAgICAgICAgICAgICAgaG91c2VudW1iZXI6IGFkZHJlc3MgJiYgYWRkcmVzcy5ob3VzZW51bWJlclxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGdlb2NvZGVBdXRvY29tcGxldGU6IGZ1bmN0aW9uIChxdWVyeSwgb3B0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSGVyZU1hcHNBUElTZXJ2aWNlLmdlb2NvZGVBdXRvY29tcGxldGUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICAgICAgYmVnaW5IaWdobGlnaHQ6IG9wdGlvbnMgJiYgb3B0aW9ucy5iZWdpbkhpZ2hsaWdodCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuZEhpZ2hsaWdodDogb3B0aW9ucyAmJiBvcHRpb25zLmVuZEhpZ2hsaWdodCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heHJlc3VsdHM6IG9wdGlvbnMgJiYgb3B0aW9ucy5tYXhyZXN1bHRzXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgZmluZExvY2F0aW9uQnlJZDogZnVuY3Rpb24gKGxvY2F0aW9uSWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEhlcmVNYXBzQVBJU2VydmljZS5maW5kTG9jYXRpb25CeUlkKGxvY2F0aW9uSWQpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgdXBkYXRlTWFya2VyczogZnVuY3Rpb24gKHBsYWNlcywgcmVmcmVzaFZpZXdib3VuZHMpIHtcbiAgICAgICAgICAgICAgICAgICAgSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLnVwZGF0ZU1hcmtlcnMoaGVyZW1hcHMubWFwLCBwbGFjZXMsIHJlZnJlc2hWaWV3Ym91bmRzKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGdldE1hcEZhY3Rvcnk6IGZ1bmN0aW9uICgpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSGVyZU1hcHNVdGlsc1NlcnZpY2UuZ2V0TWFwRmFjdG9yeSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgfVxufTtcbiIsInJlcXVpcmUoJy4vcHJvdmlkZXJzL21hcmtlcnMnKTtcbnJlcXVpcmUoJy4vcHJvdmlkZXJzL21hcC1tb2R1bGVzJyk7XG5yZXF1aXJlKCcuL3Byb3ZpZGVycy9yb3V0ZXMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBhbmd1bGFyLm1vZHVsZSgnaGVyZW1hcHMnLCBbXG4gICAgJ2hlcmVtYXBzLW1hcmtlcnMtbW9kdWxlJyxcbiAgICAnaGVyZW1hcHMtcm91dGVzLW1vZHVsZScsXG4gICAgJ2hlcmVtYXBzLW1hcC1tb2R1bGVzJ1xuXSlcbiAgICAucHJvdmlkZXIoJ0hlcmVNYXBzQ29uZmlnJywgcmVxdWlyZSgnLi9wcm92aWRlcnMvbWFwY29uZmlnLnByb3ZpZGVyJykpXG4gICAgLnNlcnZpY2UoJ0hlcmVNYXBzVXRpbHNTZXJ2aWNlJywgcmVxdWlyZSgnLi9wcm92aWRlcnMvbWFwdXRpbHMuc2VydmljZScpKVxuICAgIC5zZXJ2aWNlKCdIZXJlTWFwc0FQSVNlcnZpY2UnLCByZXF1aXJlKCcuL3Byb3ZpZGVycy9hcGkuc2VydmljZScpKVxuICAgIC5jb25zdGFudCgnSGVyZU1hcHNDT05TVFMnLCByZXF1aXJlKCcuL3Byb3ZpZGVycy9jb25zdHMnKSlcbiAgICAuZGlyZWN0aXZlKCdoZXJlbWFwcycsIHJlcXVpcmUoJy4vaGVyZW1hcHMuZGlyZWN0aXZlJykpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc0FQSVNlcnZpY2U7XG5cbkhlcmVNYXBzQVBJU2VydmljZS4kaW5qZWN0ID0gW1xuICAgICckcScsXG4gICAgJyRodHRwJyxcbiAgICAnSGVyZU1hcHNDb25maWcnLFxuICAgICdIZXJlTWFwc1V0aWxzU2VydmljZScsXG4gICAgJ0hlcmVNYXBzQ09OU1RTJ1xuXTtcbmZ1bmN0aW9uIEhlcmVNYXBzQVBJU2VydmljZSgkcSwgJGh0dHAsIEhlcmVNYXBzQ29uZmlnLCBIZXJlTWFwc1V0aWxzU2VydmljZSwgSGVyZU1hcHNDT05TVFMpIHtcbiAgICB2YXIgdmVyc2lvbiA9IEhlcmVNYXBzQ29uZmlnLmFwaVZlcnNpb24sXG4gICAgICAgIHByb3RvY29sID0gSGVyZU1hcHNDb25maWcudXNlSFRUUFMgPyAnaHR0cHMnIDogJ2h0dHAnO1xuXG4gICAgdmFyIEFQSV9WRVJTSU9OID0ge1xuICAgICAgICBWOiBwYXJzZUludCh2ZXJzaW9uKSxcbiAgICAgICAgU1VCOiB2ZXJzaW9uXG4gICAgfTtcblxuICAgIHZhciBDT05GSUcgPSB7XG4gICAgICAgIEJBU0U6IFwiOi8vanMuYXBpLmhlcmUuY29tL3ZcIixcbiAgICAgICAgQ09SRTogXCJtYXBzanMtY29yZS5qc1wiLFxuICAgICAgICBDT1JFTEVHQUNZOiBcIm1hcHNqcy1jb3JlLWxlZ2FjeS5qc1wiLFxuICAgICAgICBTRVJWSUNFOiBcIm1hcHNqcy1zZXJ2aWNlLmpzXCIsXG4gICAgICAgIFNFUlZJQ0VMRUdBQ1k6IFwibWFwc2pzLXNlcnZpY2UtbGVnYWN5LmpzXCIsXG4gICAgICAgIFVJOiB7XG4gICAgICAgICAgICBzcmM6IFwibWFwc2pzLXVpLmpzXCIsXG4gICAgICAgICAgICBocmVmOiBcIm1hcHNqcy11aS5jc3NcIlxuICAgICAgICB9LFxuICAgICAgICBFVkVOVFM6IFwibWFwc2pzLW1hcGV2ZW50cy5qc1wiLFxuICAgICAgICBBVVRPQ09NUExFVEVfVVJMOiBcIjovL2F1dG9jb21wbGV0ZS5nZW9jb2Rlci5jaXQuYXBpLmhlcmUuY29tLzYuMi9zdWdnZXN0Lmpzb25cIixcbiAgICAgICAgTE9DQVRJT05fVVJMOiBcIjovL2dlb2NvZGVyLmNpdC5hcGkuaGVyZS5jb20vNi4yL2dlb2NvZGUuanNvblwiXG4gICAgfTtcblxuICAgIHZhciBBUElfREVGRVJTUXVldWUgPSB7fTtcblxuICAgIEFQSV9ERUZFUlNRdWV1ZVtDT05GSUcuQ09SRV0gPSBbXTtcbiAgICBBUElfREVGRVJTUXVldWVbQ09ORklHLkNPUkVMRUdBQ1ldID0gW107XG4gICAgQVBJX0RFRkVSU1F1ZXVlW0NPTkZJRy5TRVJWSUNFXSA9IFtdO1xuICAgIEFQSV9ERUZFUlNRdWV1ZVtDT05GSUcuU0VSVklDRUxFR0FDWV0gPSBbXTtcbiAgICBBUElfREVGRVJTUXVldWVbQ09ORklHLlVJLnNyY10gPSBbXTtcbiAgICBBUElfREVGRVJTUXVldWVbQ09ORklHLlBBTk9dID0gW107XG4gICAgQVBJX0RFRkVSU1F1ZXVlW0NPTkZJRy5FVkVOVFNdID0gW107XG5cbiAgICB2YXIgaGVhZCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdoZWFkJylbMF07XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBsb2FkQXBpOiBsb2FkQXBpLFxuICAgICAgICBsb2FkTW9kdWxlczogbG9hZE1vZHVsZXMsXG4gICAgICAgIGdldFBvc2l0aW9uOiBnZXRQb3NpdGlvbixcbiAgICAgICAgZ2VvY29kZVBvc2l0aW9uOiBnZW9jb2RlUG9zaXRpb24sXG4gICAgICAgIGdlb2NvZGVBZGRyZXNzOiBnZW9jb2RlQWRkcmVzcyxcbiAgICAgICAgZ2VvY29kZUF1dG9jb21wbGV0ZTogZ2VvY29kZUF1dG9jb21wbGV0ZSxcbiAgICAgICAgZmluZExvY2F0aW9uQnlJZDogZmluZExvY2F0aW9uQnlJZFxuICAgIH07XG5cbiAgICAvLyNyZWdpb24gUFVCTElDXG4gICAgZnVuY3Rpb24gbG9hZEFwaSgpIHtcbiAgICAgICAgcmV0dXJuIF9nZXRMb2FkZXIoQ09ORklHLkNPUkUpXG4gICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIF9nZXRMb2FkZXIoQ09ORklHLkNPUkVMRUdBQ1kpO1xuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIF9nZXRMb2FkZXIoQ09ORklHLlNFUlZJQ0UpO1xuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIF9nZXRMb2FkZXIoQ09ORklHLlNFUlZJQ0VMRUdBQ1kpO1xuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbG9hZE1vZHVsZXMoYXR0cnMsIGhhbmRsZXJzKSB7XG4gICAgICAgIGZvciAodmFyIGtleSBpbiBoYW5kbGVycykge1xuICAgICAgICAgICAgaWYgKCFoYW5kbGVycy5oYXNPd25Qcm9wZXJ0eShrZXkpIHx8ICFhdHRyc1trZXldKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICB2YXIgbG9hZGVyID0gX2dldExvYWRlckJ5QXR0cihrZXkpO1xuXG4gICAgICAgICAgICBsb2FkZXIoKVxuICAgICAgICAgICAgICAgIC50aGVuKGhhbmRsZXJzW2tleV0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0UG9zaXRpb24ob3B0aW9ucykge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmIChvcHRpb25zICYmIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmlzVmFsaWRDb29yZHMob3B0aW9ucy5jb29yZHMpKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHsgY29vcmRzOiBvcHRpb25zLmNvb3JkcyB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG5hdmlnYXRvci5nZW9sb2NhdGlvbi5nZXRDdXJyZW50UG9zaXRpb24oZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSwgb3B0aW9ucyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZW9jb2RlUG9zaXRpb24ocGxhdGZvcm0sIHBhcmFtcykge1xuICAgICAgICBpZiAoIXBhcmFtcy5jb29yZHMpXG4gICAgICAgICAgICByZXR1cm4gY29uc29sZS5lcnJvcignTWlzc2VkIHJlcXVpcmVkIGNvb3JkcycpO1xuXG4gICAgICAgIHZhciBnZW9jb2RlciA9IHBsYXRmb3JtLmdldEdlb2NvZGluZ1NlcnZpY2UoKSxcbiAgICAgICAgICAgIGRlZmVycmVkID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICAgIF9wYXJhbXMgPSB7XG4gICAgICAgICAgICAgICAgcHJveDogW3BhcmFtcy5jb29yZHMubGF0LCBwYXJhbXMuY29vcmRzLmxuZywgcGFyYW1zLnJhZGl1cyB8fCAyNTBdLmpvaW4oJywnKSxcbiAgICAgICAgICAgICAgICBtb2RlOiAncmV0cmlldmVBZGRyZXNzZXMnLFxuICAgICAgICAgICAgICAgIG1heHJlc3VsdHM6ICcxJyxcbiAgICAgICAgICAgICAgICBnZW46ICc4JyxcbiAgICAgICAgICAgICAgICBsYW5ndWFnZTogcGFyYW1zLmxhbmcgfHwgJ2VuLWdiJ1xuICAgICAgICAgICAgfTtcblxuICAgICAgICBnZW9jb2Rlci5yZXZlcnNlR2VvY29kZShfcGFyYW1zLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzcG9uc2UpXG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdlb2NvZGVBZGRyZXNzKHBsYXRmb3JtLCBwYXJhbXMpIHtcbiAgICAgICAgaWYgKCFwYXJhbXMpXG4gICAgICAgICAgICByZXR1cm4gY29uc29sZS5lcnJvcignTWlzc2VkIHJlcXVpcmVkIHBhcmFtZXRlcnMnKTtcblxuICAgICAgICB2YXIgZ2VvY29kZXIgPSBwbGF0Zm9ybS5nZXRHZW9jb2RpbmdTZXJ2aWNlKCksXG4gICAgICAgICAgICBkZWZlcnJlZCA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgICBfcGFyYW1zID0geyBnZW46IDggfTtcblxuICAgICAgICBmb3IgKHZhciBrZXkgaW4gcGFyYW1zKSB7IF9wYXJhbXNba2V5XSA9IHBhcmFtc1trZXldOyB9XG5cbiAgICAgICAgZ2VvY29kZXIuZ2VvY29kZShfcGFyYW1zLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzcG9uc2UpXG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZW9jb2RlQXV0b2NvbXBsZXRlKHBhcmFtcykge1xuICAgICAgICBpZiAoIXBhcmFtcylcbiAgICAgICAgICAgIHJldHVybiBjb25zb2xlLmVycm9yKCdNaXNzaW5nIHJlcXVpcmVkIHBhcmFtZXRlcnMnKTtcblxuICAgICAgICB2YXIgYXV0b2NvbXBsZXRlVXJsID0gcHJvdG9jb2wgKyBDT05GSUcuQVVUT0NPTVBMRVRFX1VSTCxcbiAgICAgICAgICAgIGRlZmVycmVkID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICAgIF9wYXJhbXMgPSB7XG4gICAgICAgICAgICAgICAgcXVlcnk6IFwiXCIsXG4gICAgICAgICAgICAgICAgYmVnaW5IaWdobGlnaHQ6IFwiPG1hcms+XCIsXG4gICAgICAgICAgICAgICAgZW5kSGlnaGxpZ2h0OiBcIjwvbWFyaz5cIixcbiAgICAgICAgICAgICAgICBtYXhyZXN1bHRzOiBcIjVcIlxuICAgICAgICAgICAgfTtcblxuICAgICAgICBmb3IgKHZhciBrZXkgaW4gX3BhcmFtcykge1xuICAgICAgICAgICAgaWYgKGFuZ3VsYXIuaXNEZWZpbmVkKHBhcmFtc1trZXldKSkge1xuICAgICAgICAgICAgICAgIF9wYXJhbXNba2V5XSA9IHBhcmFtc1trZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgX3BhcmFtcy5hcHBfaWQgPSBIZXJlTWFwc0NvbmZpZy5hcHBfaWQ7XG4gICAgICAgIF9wYXJhbXMuYXBwX2NvZGUgPSBIZXJlTWFwc0NvbmZpZy5hcHBfY29kZTtcbiAgICAgICAgX3BhcmFtcy5hcGlLZXkgPSBIZXJlTWFwc0NvbmZpZy5hcGlLZXk7XG5cbiAgICAgICAgJGh0dHAuZ2V0KGF1dG9jb21wbGV0ZVVybCwgeyBwYXJhbXM6IF9wYXJhbXMgfSlcbiAgICAgICAgICAgIC5zdWNjZXNzKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmVycm9yKGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpbmRzIGxvY2F0aW9uIGJ5IEhFUkUgTWFwcyBMb2NhdGlvbiBpZGVudGlmaWVyLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGZpbmRMb2NhdGlvbkJ5SWQobG9jYXRpb25JZCkge1xuICAgICAgICBpZiAoIWxvY2F0aW9uSWQpXG4gICAgICAgICAgICByZXR1cm4gY29uc29sZS5lcnJvcignTWlzc2luZyBMb2NhdGlvbiBJZGVudGlmaWVyJyk7XG5cbiAgICAgICAgdmFyIGxvY2F0aW9uVXJsID0gcHJvdG9jb2wgKyBDT05GSUcuTE9DQVRJT05fVVJMLFxuICAgICAgICAgICAgZGVmZXJyZWQgPSAkcS5kZWZlcigpLFxuICAgICAgICAgICAgX3BhcmFtcyA9IHtcbiAgICAgICAgICAgICAgICBsb2NhdGlvbmlkOiBsb2NhdGlvbklkLFxuICAgICAgICAgICAgICAgIGdlbjogOSxcbiAgICAgICAgICAgICAgICBhcHBfaWQ6IEhlcmVNYXBzQ29uZmlnLmFwcF9pZCxcbiAgICAgICAgICAgICAgICBhcHBfY29kZTogSGVyZU1hcHNDb25maWcuYXBwX2NvZGUsXG4gICAgICAgICAgICAgICAgYXBpS2V5OiBIZXJlTWFwc0NvbmZpZy5hcGlLZXlcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgJGh0dHAuZ2V0KGxvY2F0aW9uVXJsLCB7IHBhcmFtczogX3BhcmFtcyB9KVxuICAgICAgICAgICAgLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuZXJyb3IoZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuXG4gICAgLy8jZW5kcmVnaW9uIFBVQkxJQ1xuXG4gICAgZnVuY3Rpb24gX2dldExvYWRlckJ5QXR0cihhdHRyKSB7XG4gICAgICAgIHZhciBsb2FkZXI7XG5cbiAgICAgICAgc3dpdGNoIChhdHRyKSB7XG4gICAgICAgICAgICBjYXNlIEhlcmVNYXBzQ09OU1RTLk1PRFVMRVMuVUk6XG4gICAgICAgICAgICAgICAgbG9hZGVyID0gX2xvYWRVSU1vZHVsZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgSGVyZU1hcHNDT05TVFMuTU9EVUxFUy5FVkVOVFM6XG4gICAgICAgICAgICAgICAgbG9hZGVyID0gX2xvYWRFdmVudHNNb2R1bGU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBtb2R1bGUnLCBhdHRyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBsb2FkZXI7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2xvYWRVSU1vZHVsZSgpIHtcbiAgICAgICAgaWYgKCFfaXNMb2FkZWQoQ09ORklHLlVJLnNyYykpIHtcbiAgICAgICAgICAgIHZhciBsaW5rID0gSGVyZU1hcHNVdGlsc1NlcnZpY2UuY3JlYXRlTGlua1RhZyh7XG4gICAgICAgICAgICAgICAgcmVsOiAnc3R5bGVzaGVldCcsXG4gICAgICAgICAgICAgICAgdHlwZTogJ3RleHQvY3NzJyxcbiAgICAgICAgICAgICAgICBocmVmOiBfZ2V0VVJMKENPTkZJRy5VSS5ocmVmKVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxpbmsgJiYgaGVhZC5hcHBlbmRDaGlsZChsaW5rKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBfZ2V0TG9hZGVyKENPTkZJRy5VSS5zcmMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9sb2FkRXZlbnRzTW9kdWxlKCkge1xuICAgICAgICByZXR1cm4gX2dldExvYWRlcihDT05GSUcuRVZFTlRTKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gc291cmNlTmFtZVxuICAgICAqIHJldHVybiB7U3RyaW5nfSBlLmcgaHR0cDovL2pzLmFwaS5oZXJlLmNvbS92e1ZFUn0ve1NVQlZFUlNJT059L3tTT1VSQ0V9XG4gICAgICovXG4gICAgZnVuY3Rpb24gX2dldFVSTChzb3VyY2VOYW1lKSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBwcm90b2NvbCxcbiAgICAgICAgICAgIENPTkZJRy5CQVNFLFxuICAgICAgICAgICAgQVBJX1ZFUlNJT04uVixcbiAgICAgICAgICAgIFwiL1wiLFxuICAgICAgICAgICAgQVBJX1ZFUlNJT04uU1VCLFxuICAgICAgICAgICAgXCIvXCIsXG4gICAgICAgICAgICBzb3VyY2VOYW1lXG4gICAgICAgIF0uam9pbihcIlwiKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfZ2V0TG9hZGVyKHNvdXJjZU5hbWUpIHtcbiAgICAgICAgdmFyIGRlZmVyID0gJHEuZGVmZXIoKSwgc3JjLCBzY3JpcHQ7XG5cbiAgICAgICAgaWYgKF9pc0xvYWRlZChzb3VyY2VOYW1lKSkge1xuICAgICAgICAgICAgZGVmZXIucmVzb2x2ZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3JjID0gX2dldFVSTChzb3VyY2VOYW1lKTtcbiAgICAgICAgICAgIHNjcmlwdCA9IEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmNyZWF0ZVNjcmlwdFRhZyh7IHNyYzogc3JjIH0pO1xuXG4gICAgICAgICAgICBzY3JpcHQgJiYgaGVhZC5hcHBlbmRDaGlsZChzY3JpcHQpO1xuXG4gICAgICAgICAgICBBUElfREVGRVJTUXVldWVbc291cmNlTmFtZV0ucHVzaChkZWZlcik7XG5cbiAgICAgICAgICAgIHNjcmlwdC5vbmxvYWQgPSBfb25Mb2FkLmJpbmQobnVsbCwgc291cmNlTmFtZSk7XG4gICAgICAgICAgICBzY3JpcHQub25lcnJvciA9IF9vbkVycm9yLmJpbmQobnVsbCwgc291cmNlTmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfaXNMb2FkZWQoc291cmNlTmFtZSkge1xuICAgICAgICB2YXIgY2hlY2tlciA9IG51bGw7XG5cbiAgICAgICAgc3dpdGNoIChzb3VyY2VOYW1lKSB7XG4gICAgICAgICAgICBjYXNlIENPTkZJRy5DT1JFOlxuICAgICAgICAgICAgICAgIGNoZWNrZXIgPSBfaXNDb3JlTG9hZGVkO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBDT05GSUcuU0VSVklDRTpcbiAgICAgICAgICAgICAgICBjaGVja2VyID0gX2lzU2VydmljZUxvYWRlZDtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgQ09ORklHLlVJLnNyYzpcbiAgICAgICAgICAgICAgICBjaGVja2VyID0gX2lzVUlMb2FkZWQ7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIENPTkZJRy5FVkVOVFM6XG4gICAgICAgICAgICAgICAgY2hlY2tlciA9IF9pc0V2ZW50c0xvYWRlZDtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgY2hlY2tlciA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIGZhbHNlIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY2hlY2tlcigpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9pc0NvcmVMb2FkZWQoKSB7XG4gICAgICAgIHJldHVybiAhIXdpbmRvdy5IO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9pc1NlcnZpY2VMb2FkZWQoKSB7XG4gICAgICAgIHJldHVybiAhISh3aW5kb3cuSCAmJiB3aW5kb3cuSC5zZXJ2aWNlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfaXNVSUxvYWRlZCgpIHtcbiAgICAgICAgcmV0dXJuICEhKHdpbmRvdy5IICYmIHdpbmRvdy5ILnVpKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfaXNFdmVudHNMb2FkZWQoKSB7XG4gICAgICAgIHJldHVybiAhISh3aW5kb3cuSCAmJiB3aW5kb3cuSC5tYXBldmVudHMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9vbkxvYWQoc291cmNlTmFtZSkge1xuICAgICAgICB2YXIgZGVmZXJRdWV1ZSA9IEFQSV9ERUZFUlNRdWV1ZVtzb3VyY2VOYW1lXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBkZWZlclF1ZXVlLmxlbmd0aDsgaSA8IGw7ICsraSkge1xuICAgICAgICAgICAgdmFyIGRlZmVyID0gZGVmZXJRdWV1ZVtpXTtcbiAgICAgICAgICAgIGRlZmVyLnJlc29sdmUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIEFQSV9ERUZFUlNRdWV1ZVtzb3VyY2VOYW1lXSA9IFtdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9vbkVycm9yKHNvdXJjZU5hbWUpIHtcbiAgICAgICAgdmFyIGRlZmVyUXVldWUgPSBBUElfREVGRVJTUXVldWVbc291cmNlTmFtZV07XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gZGVmZXJRdWV1ZS5sZW5ndGg7IGkgPCBsOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBkZWZlciA9IGRlZmVyUXVldWVbaV07XG4gICAgICAgICAgICBkZWZlci5yZWplY3QoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIEFQSV9ERUZFUlNRdWV1ZVtzb3VyY2VOYW1lXSA9IFtdO1xuICAgIH1cbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBVUERBVEVfTUFQX1JFU0laRV9USU1FT1VUOiA1MDAsXG4gICAgQU5JTUFUSU9OX1pPT01fU1RFUDogLjA1LFxuICAgIE1PRFVMRVM6IHtcbiAgICAgICAgVUk6ICdjb250cm9scycsXG4gICAgICAgIEVWRU5UUzogJ2V2ZW50cycsXG4gICAgICAgIFBBTk86ICdwYW5vJ1xuICAgIH0sXG4gICAgREVGQVVMVF9NQVBfT1BUSU9OUzoge1xuICAgICAgICBoZWlnaHQ6IDQ4MCxcbiAgICAgICAgd2lkdGg6IDY0MCxcbiAgICAgICAgem9vbTogMTIsXG4gICAgICAgIG1heFpvb206IDIsXG4gICAgICAgIHJlc2l6ZTogZmFsc2UsXG4gICAgICAgIGRyYWdnYWJsZTogZmFsc2UsXG4gICAgICAgIGNvb3Jkczoge1xuICAgICAgICAgICAgbG9uZ2l0dWRlOiAwLFxuICAgICAgICAgICAgbGF0aXR1ZGU6IDBcbiAgICAgICAgfVxuICAgIH0sXG4gICAgTUFSS0VSX1RZUEVTOiB7XG4gICAgICAgIERPTTogXCJET01cIixcbiAgICAgICAgU1ZHOiBcIlNWR1wiXG4gICAgfSxcbiAgICBDT05UUk9MUzoge1xuICAgICAgICBOQU1FUzoge1xuICAgICAgICAgICAgU0NBTEU6ICdzY2FsZWJhcicsXG4gICAgICAgICAgICBTRVRUSU5HUzogJ21hcHNldHRpbmdzJyxcbiAgICAgICAgICAgIFpPT006ICd6b29tJyxcbiAgICAgICAgICAgIFVTRVI6ICd1c2VycG9zaXRpb24nXG4gICAgICAgIH0sXG4gICAgICAgIFBPU0lUSU9OUzogW1xuICAgICAgICAgICAgJ3RvcC1yaWdodCcsXG4gICAgICAgICAgICAndG9wLWNlbnRlcicsXG4gICAgICAgICAgICAndG9wLWxlZnQnLFxuICAgICAgICAgICAgJ2xlZnQtdG9wJyxcbiAgICAgICAgICAgICdsZWZ0LW1pZGRsZScsXG4gICAgICAgICAgICAnbGVmdC1ib3R0b20nLFxuICAgICAgICAgICAgJ3JpZ2h0LXRvcCcsXG4gICAgICAgICAgICAncmlnaHQtbWlkZGxlJyxcbiAgICAgICAgICAgICdyaWdodC1ib3R0b20nLFxuICAgICAgICAgICAgJ2JvdHRvbS1yaWdodCcsXG4gICAgICAgICAgICAnYm90dG9tLWNlbnRlcicsXG4gICAgICAgICAgICAnYm90dG9tLWxlZnQnXG4gICAgICAgIF1cbiAgICB9LFxuICAgIElORk9CVUJCTEU6IHtcbiAgICAgICAgU1RBVEU6IHtcbiAgICAgICAgICAgIE9QRU46ICdvcGVuJyxcbiAgICAgICAgICAgIENMT1NFRDogJ2Nsb3NlZCdcbiAgICAgICAgfSxcbiAgICAgICAgRElTUExBWV9FVkVOVDoge1xuICAgICAgICAgICAgcG9pbnRlcm1vdmU6ICdvbkhvdmVyJyxcbiAgICAgICAgICAgIHRhcDogJ29uQ2xpY2snXG4gICAgICAgIH1cbiAgICB9LFxuICAgIFVTRVJfRVZFTlRTOiB7XG4gICAgICAgIHRhcDogJ2NsaWNrJyxcbiAgICAgICAgcG9pbnRlcm1vdmU6ICdtb3VzZW1vdmUnLFxuICAgICAgICBwb2ludGVybGVhdmU6ICdtb3VzZWxlYXZlJyxcbiAgICAgICAgcG9pbnRlcmVudGVyOiAnbW91c2VlbnRlcicsXG4gICAgICAgIGRyYWc6ICdkcmFnJyxcbiAgICAgICAgZHJhZ3N0YXJ0OiAnZHJhZ3N0YXJ0JyxcbiAgICAgICAgZHJhZ2VuZDogJ2RyYWdlbmQnLFxuICAgICAgICBtYXB2aWV3Y2hhbmdlOiAnbWFwdmlld2NoYW5nZScsXG4gICAgICAgIG1hcHZpZXdjaGFuZ2VzdGFydDogJ21hcHZpZXdjaGFuZ2VzdGFydCcsXG4gICAgICAgIG1hcHZpZXdjaGFuZ2VlbmQ6ICdtYXB2aWV3Y2hhbmdlZW5kJ1xuICAgIH1cbn0iLCJtb2R1bGUuZXhwb3J0cyA9IEhlcmVNYXBzRXZlbnRzRmFjdG9yeTtcblxuSGVyZU1hcHNFdmVudHNGYWN0b3J5LiRpbmplY3QgPSBbXG4gICAgJ0hlcmVNYXBzVXRpbHNTZXJ2aWNlJyxcbiAgICAnSGVyZU1hcHNNYXJrZXJTZXJ2aWNlJyxcbiAgICAnSGVyZU1hcHNDT05TVFMnLFxuICAgICdIZXJlTWFwc0luZm9CdWJibGVGYWN0b3J5J1xuXTtcbmZ1bmN0aW9uIEhlcmVNYXBzRXZlbnRzRmFjdG9yeShIZXJlTWFwc1V0aWxzU2VydmljZSwgSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLCBIZXJlTWFwc0NPTlNUUywgSGVyZU1hcHNJbmZvQnViYmxlRmFjdG9yeSkge1xuICAgIGZ1bmN0aW9uIEV2ZW50cyhwbGF0Zm9ybSwgSW5qZWN0b3IsIGxpc3RlbmVycykge1xuICAgICAgICB0aGlzLm1hcCA9IHBsYXRmb3JtLm1hcDtcbiAgICAgICAgdGhpcy5saXN0ZW5lcnMgPSBsaXN0ZW5lcnM7XG4gICAgICAgIHRoaXMuaW5qZWN0ID0gbmV3IEluamVjdG9yKCk7XG4gICAgICAgIHRoaXMuZXZlbnRzID0gcGxhdGZvcm0uZXZlbnRzID0gbmV3IEgubWFwZXZlbnRzLk1hcEV2ZW50cyh0aGlzLm1hcCk7XG4gICAgICAgIHRoaXMuYmVoYXZpb3IgPSBwbGF0Zm9ybS5iZWhhdmlvciA9IG5ldyBILm1hcGV2ZW50cy5CZWhhdmlvcih0aGlzLmV2ZW50cyk7XG4gICAgICAgIHRoaXMuYnViYmxlID0gSGVyZU1hcHNJbmZvQnViYmxlRmFjdG9yeS5jcmVhdGUoKTtcblxuICAgICAgICB0aGlzLnNldHVwRXZlbnRMaXN0ZW5lcnMoKTtcbiAgICB9XG5cbiAgICB2YXIgcHJvdG8gPSBFdmVudHMucHJvdG90eXBlO1xuXG4gICAgcHJvdG8uc2V0dXBFdmVudExpc3RlbmVycyA9IHNldHVwRXZlbnRMaXN0ZW5lcnM7XG4gICAgcHJvdG8uc2V0dXBPcHRpb25zID0gc2V0dXBPcHRpb25zO1xuICAgIHByb3RvLnRyaWdnZXJVc2VyTGlzdGVuZXIgPSB0cmlnZ2VyVXNlckxpc3RlbmVyO1xuICAgIHByb3RvLmluZm9CdWJibGVIYW5kbGVyID0gaW5mb0J1YmJsZUhhbmRsZXI7ICBcblxuICAgIHJldHVybiB7XG4gICAgICAgIHN0YXJ0OiBmdW5jdGlvbihhcmdzKSB7XG4gICAgICAgICAgICBpZiAoIShhcmdzLnBsYXRmb3JtLm1hcCBpbnN0YW5jZW9mIEguTWFwKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gY29uc29sZS5lcnJvcignTWlzc2VkIHJlcXVpcmVkIG1hcCBpbnN0YW5jZScpO1xuXG4gICAgICAgICAgICB2YXIgZXZlbnRzID0gbmV3IEV2ZW50cyhhcmdzLnBsYXRmb3JtLCBhcmdzLmluamVjdG9yLCBhcmdzLmxpc3RlbmVycyk7XG5cbiAgICAgICAgICAgIGFyZ3Mub3B0aW9ucyAmJiBldmVudHMuc2V0dXBPcHRpb25zKGFyZ3Mub3B0aW9ucyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXR1cEV2ZW50TGlzdGVuZXJzKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgSGVyZU1hcHNVdGlsc1NlcnZpY2UuYWRkRXZlbnRMaXN0ZW5lcih0aGlzLm1hcCwgJ3RhcCcsIHRoaXMuaW5mb0J1YmJsZUhhbmRsZXIuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgSGVyZU1hcHNVdGlsc1NlcnZpY2UuYWRkRXZlbnRMaXN0ZW5lcih0aGlzLm1hcCwgJ3BvaW50ZXJtb3ZlJywgdGhpcy5pbmZvQnViYmxlSGFuZGxlci5iaW5kKHRoaXMpKTtcblxuICAgICAgICBIZXJlTWFwc1V0aWxzU2VydmljZS5hZGRFdmVudExpc3RlbmVyKHRoaXMubWFwLCAnZHJhZ3N0YXJ0JywgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKEhlcmVNYXBzTWFya2VyU2VydmljZS5pc01hcmtlckluc3RhbmNlKGUudGFyZ2V0KSkge1xuICAgICAgICAgICAgICAgIHNlbGYuYmVoYXZpb3IuZGlzYWJsZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzZWxmLnRyaWdnZXJVc2VyTGlzdGVuZXIoSGVyZU1hcHNDT05TVFMuVVNFUl9FVkVOVFNbZS50eXBlXSwgZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5tYXAsICdkcmFnJywgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgdmFyIHBvaW50ZXIgPSBlLmN1cnJlbnRQb2ludGVyLFxuICAgICAgICAgICAgICAgIHRhcmdldCA9IGUudGFyZ2V0O1xuXG4gICAgICAgICAgICBpZiAoSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLmlzTWFya2VySW5zdGFuY2UodGFyZ2V0KSkge1xuICAgICAgICAgICAgICAgIHRhcmdldC5zZXRHZW9tZXRyeShzZWxmLm1hcC5zY3JlZW5Ub0dlbyhwb2ludGVyLnZpZXdwb3J0WCwgcG9pbnRlci52aWV3cG9ydFkpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc2VsZi50cmlnZ2VyVXNlckxpc3RlbmVyKEhlcmVNYXBzQ09OU1RTLlVTRVJfRVZFTlRTW2UudHlwZV0sIGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICBIZXJlTWFwc1V0aWxzU2VydmljZS5hZGRFdmVudExpc3RlbmVyKHRoaXMubWFwLCAnZHJhZ2VuZCcsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIGlmIChIZXJlTWFwc01hcmtlclNlcnZpY2UuaXNNYXJrZXJJbnN0YW5jZShlLnRhcmdldCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmJlaGF2aW9yLmVuYWJsZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzZWxmLnRyaWdnZXJVc2VyTGlzdGVuZXIoSGVyZU1hcHNDT05TVFMuVVNFUl9FVkVOVFNbZS50eXBlXSwgZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5tYXAsICdtYXB2aWV3Y2hhbmdlc3RhcnQnLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBzZWxmLnRyaWdnZXJVc2VyTGlzdGVuZXIoSGVyZU1hcHNDT05TVFMuVVNFUl9FVkVOVFNbZS50eXBlXSwgZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5tYXAsICdtYXB2aWV3Y2hhbmdlJywgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgc2VsZi50cmlnZ2VyVXNlckxpc3RlbmVyKEhlcmVNYXBzQ09OU1RTLlVTRVJfRVZFTlRTW2UudHlwZV0sIGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICBIZXJlTWFwc1V0aWxzU2VydmljZS5hZGRFdmVudExpc3RlbmVyKHRoaXMubWFwLCAnbWFwdmlld2NoYW5nZWVuZCcsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHNlbGYudHJpZ2dlclVzZXJMaXN0ZW5lcihIZXJlTWFwc0NPTlNUUy5VU0VSX0VWRU5UU1tlLnR5cGVdLCBlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0dXBPcHRpb25zKG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKCFvcHRpb25zKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMubWFwLmRyYWdnYWJsZSA9ICEhb3B0aW9ucy5kcmFnZ2FibGU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdHJpZ2dlclVzZXJMaXN0ZW5lcihldmVudE5hbWUsIGUpIHtcbiAgICAgICAgaWYgKCF0aGlzLmxpc3RlbmVycylcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgY2FsbGJhY2sgPSB0aGlzLmxpc3RlbmVyc1tldmVudE5hbWVdO1xuXG4gICAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrKGUpO1xuICAgIH1cbiAgICBcbiAgICBmdW5jdGlvbiBpbmZvQnViYmxlSGFuZGxlcihlKXtcbiAgICAgICAgdmFyIHVpID0gdGhpcy5pbmplY3QoJ3VpJyk7XG4gICAgICAgIFxuICAgICAgICBpZih1aSlcbiAgICAgICAgICAgIHRoaXMuYnViYmxlLnRvZ2dsZShlLCB1aSk7XG4gICAgICAgICAgICBcbiAgICAgICAgdGhpcy50cmlnZ2VyVXNlckxpc3RlbmVyKEhlcmVNYXBzQ09OU1RTLlVTRVJfRVZFTlRTW2UudHlwZV0sIGUpOyAgICAgIFxuICAgIH1cblxufTsiLCJtb2R1bGUuZXhwb3J0cyA9IEhlcmVNYXBzSW5mb0J1YmJsZUZhY3Rvcnk7XG5cbkhlcmVNYXBzSW5mb0J1YmJsZUZhY3RvcnkuJGluamVjdCA9IFtcbiAgICAnSGVyZU1hcHNNYXJrZXJTZXJ2aWNlJyxcbiAgICAnSGVyZU1hcHNVdGlsc1NlcnZpY2UnLFxuICAgICdIZXJlTWFwc0NPTlNUUydcbl07XG5mdW5jdGlvbiBIZXJlTWFwc0luZm9CdWJibGVGYWN0b3J5KEhlcmVNYXBzTWFya2VyU2VydmljZSwgSGVyZU1hcHNVdGlsc1NlcnZpY2UsIEhlcmVNYXBzQ09OU1RTKSB7XG4gICAgZnVuY3Rpb24gSW5mb0J1YmJsZSgpIHt9XG5cbiAgICB2YXIgcHJvdG8gPSBJbmZvQnViYmxlLnByb3RvdHlwZTtcbiAgICAgICAgXG4gICAgcHJvdG8uY3JlYXRlID0gY3JlYXRlO1xuICAgIHByb3RvLnVwZGF0ZSA9IHVwZGF0ZTtcbiAgICBwcm90by50b2dnbGUgPSB0b2dnbGU7XG4gICAgcHJvdG8uc2hvdyA9IHNob3c7XG4gICAgcHJvdG8uY2xvc2UgPSBjbG9zZTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGNyZWF0ZTogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHJldHVybiBuZXcgSW5mb0J1YmJsZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdG9nZ2xlKGUsIHVpKSB7XG4gICAgICAgIGlmIChIZXJlTWFwc01hcmtlclNlcnZpY2UuaXNNYXJrZXJJbnN0YW5jZShlLnRhcmdldCkpXG4gICAgICAgICAgICB0aGlzLnNob3coZSwgdWkpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLmNsb3NlKGUsIHVpKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB1cGRhdGUoYnViYmxlLCBkYXRhKSB7XG4gICAgICAgIGJ1YmJsZS5kaXNwbGF5ID0gZGF0YS5kaXNwbGF5O1xuXG4gICAgICAgIGJ1YmJsZS5zZXRHZW9tZXRyeShkYXRhLnBvc2l0aW9uKTtcbiAgICAgICAgYnViYmxlLnNldENvbnRlbnQoZGF0YS5tYXJrdXApO1xuXG4gICAgICAgIGJ1YmJsZS5zZXRTdGF0ZShIZXJlTWFwc0NPTlNUUy5JTkZPQlVCQkxFLlNUQVRFLk9QRU4pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZShzb3VyY2UpIHtcbiAgICAgICAgdmFyIGJ1YmJsZSA9IG5ldyBILnVpLkluZm9CdWJibGUoc291cmNlLnBvc2l0aW9uLCB7XG4gICAgICAgICAgICBjb250ZW50OiBzb3VyY2UubWFya3VwXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGJ1YmJsZS5kaXNwbGF5ID0gc291cmNlLmRpc3BsYXk7XG4gICAgICAgIGJ1YmJsZS5hZGRDbGFzcyhIZXJlTWFwc0NPTlNUUy5JTkZPQlVCQkxFLlNUQVRFLk9QRU4pXG5cbiAgICAgICAgSGVyZU1hcHNVdGlsc1NlcnZpY2UuYWRkRXZlbnRMaXN0ZW5lcihidWJibGUsICdzdGF0ZWNoYW5nZScsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHZhciBzdGF0ZSA9IHRoaXMuZ2V0U3RhdGUoKSxcbiAgICAgICAgICAgICAgICBlbCA9IHRoaXMuZ2V0RWxlbWVudCgpO1xuICAgICAgICAgICAgaWYgKHN0YXRlID09PSBIZXJlTWFwc0NPTlNUUy5JTkZPQlVCQkxFLlNUQVRFLkNMT1NFRCkge1xuICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoSGVyZU1hcHNDT05TVFMuSU5GT0JVQkJMRS5TVEFURS5PUEVOKTtcbiAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuYWRkQ2xhc3Moc3RhdGUpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBidWJibGU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2hvdyhlLCB1aSwgZGF0YSkge1xuICAgICAgICB2YXIgdGFyZ2V0ID0gZS50YXJnZXQsXG4gICAgICAgICAgICBkYXRhID0gdGFyZ2V0LmdldERhdGEoKSxcbiAgICAgICAgICAgIGVsID0gbnVsbDtcblxuICAgICAgICBpZiAoIWRhdGEgfHwgIWRhdGEuZGlzcGxheSB8fCAhZGF0YS5tYXJrdXAgfHwgZGF0YS5kaXNwbGF5ICE9PSBIZXJlTWFwc0NPTlNUUy5JTkZPQlVCQkxFLkRJU1BMQVlfRVZFTlRbZS50eXBlXSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgc291cmNlID0ge1xuICAgICAgICAgICAgcG9zaXRpb246IHRhcmdldC5nZXRHZW9tZXRyeSgpLFxuICAgICAgICAgICAgbWFya3VwOiBkYXRhLm1hcmt1cCxcbiAgICAgICAgICAgIGRpc3BsYXk6IGRhdGEuZGlzcGxheVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmICghdWkuYnViYmxlKSB7XG4gICAgICAgICAgICB1aS5idWJibGUgPSB0aGlzLmNyZWF0ZShzb3VyY2UpO1xuICAgICAgICAgICAgdWkuYWRkQnViYmxlKHVpLmJ1YmJsZSk7XG5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMudXBkYXRlKHVpLmJ1YmJsZSwgc291cmNlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbG9zZShlLCB1aSkge1xuICAgICAgICBpZiAoIXVpLmJ1YmJsZSB8fCB1aS5idWJibGUuZGlzcGxheSAhPT0gSGVyZU1hcHNDT05TVFMuSU5GT0JVQkJMRS5ESVNQTEFZX0VWRU5UW2UudHlwZV0pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHVpLmJ1YmJsZS5zZXRTdGF0ZShIZXJlTWFwc0NPTlNUUy5JTkZPQlVCQkxFLlNUQVRFLkNMT1NFRCk7XG4gICAgfVxufSIsImFuZ3VsYXIubW9kdWxlKCdoZXJlbWFwcy1ldmVudHMtbW9kdWxlJywgW10pXG4gICAgLmZhY3RvcnkoJ0hlcmVNYXBzRXZlbnRzRmFjdG9yeScsIHJlcXVpcmUoJy4vZXZlbnRzL2V2ZW50cy5qcycpKVxuICAgIC5mYWN0b3J5KCdIZXJlTWFwc0luZm9CdWJibGVGYWN0b3J5JywgcmVxdWlyZSgnLi9ldmVudHMvaW5mb2J1YmJsZS5qcycpKTtcbiAgICBcbmFuZ3VsYXIubW9kdWxlKCdoZXJlbWFwcy11aS1tb2R1bGUnLCBbXSlcbiAgICAuZmFjdG9yeSgnSGVyZU1hcHNVaUZhY3RvcnknLCByZXF1aXJlKCcuL3VpL3VpLmpzJykpXG5cbm1vZHVsZS5leHBvcnRzID0gYW5ndWxhci5tb2R1bGUoJ2hlcmVtYXBzLW1hcC1tb2R1bGVzJywgW1xuXHQnaGVyZW1hcHMtZXZlbnRzLW1vZHVsZScsXG4gICAgJ2hlcmVtYXBzLXVpLW1vZHVsZSdcbl0pOyIsIm1vZHVsZS5leHBvcnRzID0gSGVyZU1hcHNVaUZhY3Rvcnk7XG5cbkhlcmVNYXBzVWlGYWN0b3J5LiRpbmplY3QgPSBbXG4gICAgJ0hlcmVNYXBzQVBJU2VydmljZScsXG4gICAgJ0hlcmVNYXBzTWFya2VyU2VydmljZScsXG4gICAgJ0hlcmVNYXBzVXRpbHNTZXJ2aWNlJyxcbiAgICAnSGVyZU1hcHNDT05TVFMnXG5dO1xuZnVuY3Rpb24gSGVyZU1hcHNVaUZhY3RvcnkoSGVyZU1hcHNBUElTZXJ2aWNlLCBIZXJlTWFwc01hcmtlclNlcnZpY2UsIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLCBIZXJlTWFwc0NPTlNUUykge1xuICAgIGZ1bmN0aW9uIFVJKHBsYXRmb3JtLCBhbGlnbm1lbnQpIHtcbiAgICAgICAgdGhpcy5tYXAgPSBwbGF0Zm9ybS5tYXA7XG4gICAgICAgIHRoaXMubGF5ZXJzID0gcGxhdGZvcm0ubGF5ZXJzO1xuICAgICAgICB0aGlzLmFsaWdubWVudCA9IGFsaWdubWVudDtcbiAgICAgICAgdGhpcy51aSA9IHBsYXRmb3JtLnVpID0gSC51aS5VSS5jcmVhdGVEZWZhdWx0KHRoaXMubWFwLCB0aGlzLmxheWVycyk7XG5cbiAgICAgICAgdGhpcy5zZXR1cENvbnRyb2xzKCk7XG4gICAgfVxuXG4gICAgVUkuaXNWYWxpZEFsaWdubWVudCA9IGlzVmFsaWRBbGlnbm1lbnQ7XG5cbiAgICB2YXIgcHJvdG8gPSBVSS5wcm90b3R5cGU7XG5cbiAgICBwcm90by5zZXR1cENvbnRyb2xzID0gc2V0dXBDb250cm9scztcbiAgICBwcm90by5jcmVhdGVVc2VyQ29udHJvbCA9IGNyZWF0ZVVzZXJDb250cm9sO1xuICAgIHByb3RvLnNldENvbnRyb2xzQWxpZ25tZW50ID0gc2V0Q29udHJvbHNBbGlnbm1lbnQ7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBzdGFydDogZnVuY3Rpb24oYXJncykge1xuICAgICAgICAgICAgaWYgKCEoYXJncy5wbGF0Zm9ybS5tYXAgaW5zdGFuY2VvZiBILk1hcCkgJiYgIShhcmdzLnBsYXRmb3JtLmxheWVycykpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ01pc3NlZCB1aSBtb2R1bGUgZGVwZW5kZW5jaWVzJyk7XG5cbiAgICAgICAgICAgIHZhciB1aSA9IG5ldyBVSShhcmdzLnBsYXRmb3JtLCBhcmdzLmFsaWdubWVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXR1cENvbnRyb2xzKCkge1xuICAgICAgICB2YXIgTkFNRVMgPSBIZXJlTWFwc0NPTlNUUy5DT05UUk9MUy5OQU1FUyxcbiAgICAgICAgICAgIHVzZXJDb250cm9sID0gdGhpcy5jcmVhdGVVc2VyQ29udHJvbCgpO1xuXG4gICAgICAgIHRoaXMudWkuYWRkQ29udHJvbChOQU1FUy5VU0VSLCB1c2VyQ29udHJvbCk7XG4gICAgICAgIHRoaXMuc2V0Q29udHJvbHNBbGlnbm1lbnQoTkFNRVMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZVVzZXJDb250cm9sKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXMsXG4gICAgICAgICAgICB1c2VyQ29udHJvbCA9IG5ldyBILnVpLkNvbnRyb2woKSxcbiAgICAgICAgICAgIG1hcmt1cCA9ICc8c3ZnIGNsYXNzPVwiSF9pY29uXCIgZmlsbD1cIiNmZmZcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAxNiAxNlwiPjxwYXRoIGNsYXNzPVwibWlkZGxlX2xvY2F0aW9uX3N0cm9rZVwiIGQ9XCJNOCAxMmMtMi4yMDYgMC00LTEuNzk1LTQtNCAwLTIuMjA2IDEuNzk0LTQgNC00czQgMS43OTQgNCA0YzAgMi4yMDUtMS43OTQgNC00IDRNOCAxLjI1YTYuNzUgNi43NSAwIDEgMCAwIDEzLjUgNi43NSA2Ljc1IDAgMCAwIDAtMTMuNVwiPjwvcGF0aD48cGF0aCBjbGFzcz1cImlubmVyX2xvY2F0aW9uX3N0cm9rZVwiIGQ9XCJNOCA1YTMgMyAwIDEgMSAuMDAxIDZBMyAzIDAgMCAxIDggNW0wLTFDNS43OTQgNCA0IDUuNzk0IDQgOGMwIDIuMjA1IDEuNzk0IDQgNCA0czQtMS43OTUgNC00YzAtMi4yMDYtMS43OTQtNC00LTRcIj48L3BhdGg+PHBhdGggY2xhc3M9XCJvdXRlcl9sb2NhdGlvbl9zdHJva2VcIiBkPVwiTTggMS4yNWE2Ljc1IDYuNzUgMCAxIDEgMCAxMy41IDYuNzUgNi43NSAwIDAgMSAwLTEzLjVNOCAwQzMuNTkgMCAwIDMuNTkgMCA4YzAgNC40MTEgMy41OSA4IDggOHM4LTMuNTg5IDgtOGMwLTQuNDEtMy41OS04LTgtOFwiPjwvcGF0aD48L3N2Zz4nO1xuXG4gICAgICAgIHZhciB1c2VyQ29udHJvbEJ1dHRvbiA9IG5ldyBILnVpLmJhc2UuQnV0dG9uKHtcbiAgICAgICAgICAgIGxhYmVsOiBtYXJrdXAsXG4gICAgICAgICAgICBvblN0YXRlQ2hhbmdlOiBmdW5jdGlvbihldnQpIHtcbiAgICAgICAgICAgICAgICBpZiAodXNlckNvbnRyb2xCdXR0b24uZ2V0U3RhdGUoKSA9PT0gSC51aS5iYXNlLkJ1dHRvbi5TdGF0ZS5ET1dOKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgICAgICBIZXJlTWFwc0FQSVNlcnZpY2UuZ2V0UG9zaXRpb24oKS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwb3NpdGlvbiA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxuZzogcmVzcG9uc2UuY29vcmRzLmxvbmdpdHVkZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxhdDogcmVzcG9uc2UuY29vcmRzLmxhdGl0dWRlXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBzZWxmLm1hcC5zZXRDZW50ZXIocG9zaXRpb24pO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgSGVyZU1hcHNVdGlsc1NlcnZpY2Uuem9vbShzZWxmLm1hcCwgMTcsIC4wOCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHNlbGYudXNlck1hcmtlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi51c2VyTWFya2VyLnNldEdlb21ldHJ5KHBvc2l0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgc2VsZi51c2VyTWFya2VyID0gSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLmFkZFVzZXJNYXJrZXIoc2VsZi5tYXAsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvczogcG9zaXRpb25cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHVzZXJDb250cm9sLmFkZENoaWxkKHVzZXJDb250cm9sQnV0dG9uKTtcblxuICAgICAgICByZXR1cm4gdXNlckNvbnRyb2w7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0Q29udHJvbHNBbGlnbm1lbnQoTkFNRVMpIHtcbiAgICAgICAgaWYgKCFVSS5pc1ZhbGlkQWxpZ25tZW50KHRoaXMuYWxpZ25tZW50KSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBmb3IgKHZhciBpZCBpbiBOQU1FUykge1xuICAgICAgICAgICAgdmFyIGNvbnRyb2wgPSB0aGlzLnVpLmdldENvbnRyb2woTkFNRVNbaWRdKTtcblxuICAgICAgICAgICAgaWYgKCFOQU1FUy5oYXNPd25Qcm9wZXJ0eShpZCkgfHwgIWNvbnRyb2wpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnRyb2wuc2V0QWxpZ25tZW50KHRoaXMuYWxpZ25tZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzVmFsaWRBbGlnbm1lbnQoYWxpZ25tZW50KSB7XG4gICAgICAgIHJldHVybiAhIShIZXJlTWFwc0NPTlNUUy5DT05UUk9MUy5QT1NJVElPTlMuaW5kZXhPZihhbGlnbm1lbnQpICsgMSk7XG4gICAgfVxuXG59OyIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG9wdGlvbnMgPSB7fTtcbiAgICB2YXIgREVGQVVMVF9BUElfVkVSU0lPTiA9IFwiMy4xXCI7XG5cbiAgICB0aGlzLiRnZXQgPSBmdW5jdGlvbigpe1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgYXBwX2lkOiBvcHRpb25zLmFwcF9pZCxcbiAgICAgICAgICAgIGFwcF9jb2RlOiBvcHRpb25zLmFwcF9jb2RlLFxuICAgICAgICAgICAgYXBpS2V5OiBvcHRpb25zLmFwaUtleSxcbiAgICAgICAgICAgIGFwaVZlcnNpb246IG9wdGlvbnMuYXBpVmVyc2lvbiB8fCBERUZBVUxUX0FQSV9WRVJTSU9OLFxuICAgICAgICAgICAgdXNlSFRUUFM6IG9wdGlvbnMudXNlSFRUUFMsXG4gICAgICAgICAgICB1c2VDSVQ6ICEhb3B0aW9ucy51c2VDSVQsXG4gICAgICAgICAgICBtYXBUaWxlQ29uZmlnOiBvcHRpb25zLm1hcFRpbGVDb25maWdcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICB0aGlzLnNldE9wdGlvbnMgPSBmdW5jdGlvbihvcHRzKXtcbiAgICAgICAgb3B0aW9ucyA9IG9wdHM7XG4gICAgfTtcbn07IiwiXG5tb2R1bGUuZXhwb3J0cyA9IEhlcmVNYXBzVXRpbHNTZXJ2aWNlO1xuXG5IZXJlTWFwc1V0aWxzU2VydmljZS4kaW5qZWN0ID0gW1xuICAgICckcm9vdFNjb3BlJywgXG4gICAgJyR0aW1lb3V0JywgXG4gICAgJ0hlcmVNYXBzQ09OU1RTJ1xuXTtcbmZ1bmN0aW9uIEhlcmVNYXBzVXRpbHNTZXJ2aWNlKCRyb290U2NvcGUsICR0aW1lb3V0LCBIZXJlTWFwc0NPTlNUUykge1xuICAgIHJldHVybiB7XG4gICAgICAgIHRocm90dGxlOiB0aHJvdHRsZSxcbiAgICAgICAgY3JlYXRlU2NyaXB0VGFnOiBjcmVhdGVTY3JpcHRUYWcsXG4gICAgICAgIGNyZWF0ZUxpbmtUYWc6IGNyZWF0ZUxpbmtUYWcsXG4gICAgICAgIHJ1blNjb3BlRGlnZXN0SWZOZWVkOiBydW5TY29wZURpZ2VzdElmTmVlZCxcbiAgICAgICAgaXNWYWxpZENvb3JkczogaXNWYWxpZENvb3JkcyxcbiAgICAgICAgYWRkRXZlbnRMaXN0ZW5lcjogYWRkRXZlbnRMaXN0ZW5lcixcbiAgICAgICAgem9vbTogem9vbSxcbiAgICAgICAgZ2V0Qm91bmRzUmVjdEZyb21Qb2ludHM6IGdldEJvdW5kc1JlY3RGcm9tUG9pbnRzLFxuICAgICAgICBnZW5lcmF0ZUlkOiBnZW5lcmF0ZUlkLFxuICAgICAgICBnZXRNYXBGYWN0b3J5OiBnZXRNYXBGYWN0b3J5XG4gICAgfTtcblxuICAgIC8vI3JlZ2lvbiBQVUJMSUNcbiAgICBmdW5jdGlvbiB0aHJvdHRsZShmbiwgcGVyaW9kKSB7XG4gICAgICAgIHZhciB0aW1lb3V0ID0gbnVsbDtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKCR0aW1lb3V0KVxuICAgICAgICAgICAgICAgICR0aW1lb3V0LmNhbmNlbCh0aW1lb3V0KTtcblxuICAgICAgICAgICAgdGltZW91dCA9ICR0aW1lb3V0KGZuLCBwZXJpb2QpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYWRkRXZlbnRMaXN0ZW5lcihvYmosIGV2ZW50TmFtZSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpIHtcbiAgICAgICAgb2JqLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBsaXN0ZW5lciwgISF1c2VDYXB0dXJlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBydW5TY29wZURpZ2VzdElmTmVlZChzY29wZSwgY2IpIHtcbiAgICAgICAgaWYgKHNjb3BlLiRyb290ICYmIHNjb3BlLiRyb290LiQkcGhhc2UgIT09ICckYXBwbHknICYmIHNjb3BlLiRyb290LiQkcGhhc2UgIT09ICckZGlnZXN0Jykge1xuICAgICAgICAgICAgc2NvcGUuJGRpZ2VzdChjYiB8fCBhbmd1bGFyLm5vb3ApO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZVNjcmlwdFRhZyhhdHRycykge1xuICAgICAgICB2YXIgc2NyaXB0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYXR0cnMuc3JjKTtcblxuICAgICAgICBpZiAoc2NyaXB0KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuICAgICAgICBzY3JpcHQudHlwZSA9ICd0ZXh0L2phdmFzY3JpcHQnO1xuICAgICAgICBzY3JpcHQuaWQgPSBhdHRycy5zcmM7XG4gICAgICAgIF9zZXRBdHRycyhzY3JpcHQsIGF0dHJzKTtcblxuICAgICAgICByZXR1cm4gc2NyaXB0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZUxpbmtUYWcoYXR0cnMpIHtcbiAgICAgICAgdmFyIGxpbmsgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhdHRycy5ocmVmKTtcblxuICAgICAgICBpZiAobGluaylcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGluaycpO1xuICAgICAgICBsaW5rLmlkID0gYXR0cnMuaHJlZjtcbiAgICAgICAgX3NldEF0dHJzKGxpbmssIGF0dHJzKTtcblxuICAgICAgICByZXR1cm4gbGluaztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc1ZhbGlkQ29vcmRzKGNvb3Jkcykge1xuICAgICAgICByZXR1cm4gY29vcmRzICYmXG4gICAgICAgICAgICAodHlwZW9mIGNvb3Jkcy5sYXRpdHVkZSA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIGNvb3Jkcy5sYXRpdHVkZSA9PT0gJ251bWJlcicpICYmXG4gICAgICAgICAgICAodHlwZW9mIGNvb3Jkcy5sb25naXR1ZGUgPT09ICdzdHJpbmcnIHx8IHR5cGVvZiBjb29yZHMubG9uZ2l0dWRlID09PSAnbnVtYmVyJylcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB6b29tKG1hcCwgdmFsdWUsIHN0ZXApIHtcbiAgICAgICAgdmFyIGN1cnJlbnRab29tID0gbWFwLmdldFpvb20oKSxcbiAgICAgICAgICAgIF9zdGVwID0gc3RlcCB8fCBIZXJlTWFwc0NPTlNUUy5BTklNQVRJT05fWk9PTV9TVEVQLFxuICAgICAgICAgICAgZmFjdG9yID0gY3VycmVudFpvb20gPj0gdmFsdWUgPyAtMSA6IDEsXG4gICAgICAgICAgICBpbmNyZW1lbnQgPSBzdGVwICogZmFjdG9yO1xuXG4gICAgICAgIHJldHVybiAoZnVuY3Rpb24gem9vbSgpIHtcbiAgICAgICAgICAgIGlmICghc3RlcCB8fCBNYXRoLmZsb29yKGN1cnJlbnRab29tKSA9PT0gTWF0aC5mbG9vcih2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICBtYXAuc2V0Wm9vbSh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjdXJyZW50Wm9vbSArPSBpbmNyZW1lbnQ7XG4gICAgICAgICAgICBtYXAuc2V0Wm9vbShjdXJyZW50Wm9vbSk7XG5cbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh6b29tKTtcbiAgICAgICAgfSkoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRNYXBGYWN0b3J5KCl7XG4gICAgICAgIHJldHVybiBIO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0Qm91bmRzUmVjdEZyb21Qb2ludHNcbiAgICAgKiBcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdG9wTGVmdCBcbiAgICAgKiAgQHByb3BlcnR5IHtOdW1iZXJ8U3RyaW5nfSBsYXRcbiAgICAgKiAgQHByb3BlcnR5IHtOdW1iZXJ8U3RyaW5nfSBsbmdcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gYm90dG9tUmlnaHQgXG4gICAgICogIEBwcm9wZXJ0eSB7TnVtYmVyfFN0cmluZ30gbGF0XG4gICAgICogIEBwcm9wZXJ0eSB7TnVtYmVyfFN0cmluZ30gbG5nXG4gICAgICogXG4gICAgICogQHJldHVybiB7SC5nZW8uUmVjdH1cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRCb3VuZHNSZWN0RnJvbVBvaW50cyh0b3BMZWZ0LCBib3R0b21SaWdodCkge1xuICAgICAgICByZXR1cm4gSC5nZW8uUmVjdC5mcm9tUG9pbnRzKHRvcExlZnQsIGJvdHRvbVJpZ2h0LCB0cnVlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZW5lcmF0ZUlkKCkge1xuICAgICAgICB2YXIgbWFzayA9ICd4eHh4eHh4eC14eHh4LTR4eHgteXh4eC14eHh4eHh4eHh4eHgnLFxuICAgICAgICAgICAgcmVnZXhwID0gL1t4eV0vZyxcbiAgICAgICAgICAgIGQgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSxcbiAgICAgICAgICAgIHV1aWQgPSBtYXNrLnJlcGxhY2UocmVnZXhwLCBmdW5jdGlvbiAoYykge1xuICAgICAgICAgICAgICAgIHZhciByID0gKGQgKyBNYXRoLnJhbmRvbSgpICogMTYpICUgMTYgfCAwO1xuICAgICAgICAgICAgICAgIGQgPSBNYXRoLmZsb29yKGQgLyAxNik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIChjID09ICd4JyA/IHIgOiAociAmIDB4MyB8IDB4OCkpLnRvU3RyaW5nKDE2KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB1dWlkO1xuICAgIH1cblxuICAgIC8vI2VuZHJlZ2lvbiBQVUJMSUMgXG5cbiAgICBmdW5jdGlvbiBfc2V0QXR0cnMoZWwsIGF0dHJzKSB7XG4gICAgICAgIGlmICghZWwgfHwgIWF0dHJzKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzZWQgYXR0cmlidXRlcycpO1xuXG4gICAgICAgIGZvciAodmFyIGtleSBpbiBhdHRycykge1xuICAgICAgICAgICAgaWYgKCFhdHRycy5oYXNPd25Qcm9wZXJ0eShrZXkpKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBlbFtrZXldID0gYXR0cnNba2V5XTtcbiAgICAgICAgfVxuICAgIH1cbn07IiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc0RlZmF1bHRNYXJrZXI7XG5cbkhlcmVNYXBzRGVmYXVsdE1hcmtlci4kaW5qZWN0ID0gWydIZXJlTWFwc01hcmtlckludGVyZmFjZSddO1xuZnVuY3Rpb24gSGVyZU1hcHNEZWZhdWx0TWFya2VyKEhlcmVNYXBzTWFya2VySW50ZXJmYWNlKXtcbiAgICBmdW5jdGlvbiBEZWZhdWx0TWFya2VyKHBsYWNlKXtcbiAgICAgICAgdGhpcy5wbGFjZSA9IHBsYWNlO1xuICAgICAgICB0aGlzLnNldENvb3JkcygpO1xuICAgIH1cblxuICAgIHZhciBwcm90byA9IERlZmF1bHRNYXJrZXIucHJvdG90eXBlID0gbmV3IEhlcmVNYXBzTWFya2VySW50ZXJmYWNlKCk7XG4gICAgcHJvdG8uY29uc3RydWN0b3IgPSBEZWZhdWx0TWFya2VyO1xuXG4gICAgcHJvdG8uY3JlYXRlID0gY3JlYXRlO1xuXG4gICAgcmV0dXJuIERlZmF1bHRNYXJrZXI7XG4gICAgXG4gICAgZnVuY3Rpb24gY3JlYXRlKCl7XG4gICAgICAgIHZhciBtYXJrZXIgPSBuZXcgSC5tYXAuTWFya2VyKHRoaXMuY29vcmRzKTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMuYWRkSW5mb0J1YmJsZShtYXJrZXIpO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIG1hcmtlcjtcbiAgICB9XG59IiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc0RPTU1hcmtlcjtcblxuSGVyZU1hcHNET01NYXJrZXIuJGluamVjdCA9IFsnSGVyZU1hcHNNYXJrZXJJbnRlcmZhY2UnXTtcbmZ1bmN0aW9uIEhlcmVNYXBzRE9NTWFya2VyKEhlcmVNYXBzTWFya2VySW50ZXJmYWNlKXtcbiAgICBmdW5jdGlvbiBET01NYXJrZXIocGxhY2Upe1xuICAgICAgICB0aGlzLnBsYWNlID0gcGxhY2U7XG4gICAgICAgIHRoaXMuc2V0Q29vcmRzKCk7XG4gICAgfVxuXG4gICAgdmFyIHByb3RvID0gRE9NTWFya2VyLnByb3RvdHlwZSA9IG5ldyBIZXJlTWFwc01hcmtlckludGVyZmFjZSgpO1xuICAgIHByb3RvLmNvbnN0cnVjdG9yID0gRE9NTWFya2VyO1xuXG4gICAgcHJvdG8uY3JlYXRlID0gY3JlYXRlO1xuICAgIHByb3RvLmdldEljb24gPSBnZXRJY29uO1xuICAgIHByb3RvLnNldHVwRXZlbnRzID0gc2V0dXBFdmVudHM7XG5cbiAgICByZXR1cm4gRE9NTWFya2VyO1xuICAgIFxuICAgIGZ1bmN0aW9uIGNyZWF0ZSgpe1xuICAgICAgICB2YXIgbWFya2VyID0gbmV3IEgubWFwLkRvbU1hcmtlcih0aGlzLmNvb3Jkcywge1xuICAgICAgICAgICAgaWNvbjogdGhpcy5nZXRJY29uKClcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmFkZEluZm9CdWJibGUobWFya2VyKTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBtYXJrZXI7XG4gICAgfVxuICAgIFxuICAgIGZ1bmN0aW9uIGdldEljb24oKXtcbiAgICAgICAgdmFyIGljb24gPSB0aGlzLnBsYWNlLm1hcmt1cDtcbiAgICAgICAgIGlmKCFpY29uKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXJrdXAgbWlzc2VkJyk7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBILm1hcC5Eb21JY29uKGljb24pO1xuICAgIH1cbiAgICBcbiAgICBmdW5jdGlvbiBzZXR1cEV2ZW50cyhlbCwgZXZlbnRzLCByZW1vdmUpe1xuICAgICAgICB2YXIgbWV0aG9kID0gcmVtb3ZlID8gJ3JlbW92ZUV2ZW50TGlzdGVuZXInIDogJ2FkZEV2ZW50TGlzdGVuZXInO1xuXG4gICAgICAgIGZvcih2YXIga2V5IGluIGV2ZW50cykge1xuICAgICAgICAgICAgaWYoIWV2ZW50cy5oYXNPd25Qcm9wZXJ0eShrZXkpKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBlbFttZXRob2RdLmNhbGwobnVsbCwga2V5LCBldmVudHNba2V5XSk7XG4gICAgICAgIH1cbiAgICB9XG59IiwibW9kdWxlLmV4cG9ydHMgPSBhbmd1bGFyLm1vZHVsZSgnaGVyZW1hcHMtbWFya2Vycy1tb2R1bGUnLCBbXSlcbiAgICAuZmFjdG9yeSgnSGVyZU1hcHNNYXJrZXJJbnRlcmZhY2UnLCByZXF1aXJlKCcuL21hcmtlci5qcycpKVxuICAgIC5mYWN0b3J5KCdIZXJlTWFwc0RlZmF1bHRNYXJrZXInLCByZXF1aXJlKCcuL2RlZmF1bHQubWFya2VyLmpzJykpXG4gICAgLmZhY3RvcnkoJ0hlcmVNYXBzRE9NTWFya2VyJywgcmVxdWlyZSgnLi9kb20ubWFya2VyLmpzJykpXG4gICAgLmZhY3RvcnkoJ0hlcmVNYXBzU1ZHTWFya2VyJywgcmVxdWlyZSgnLi9zdmcubWFya2VyLmpzJykpXG4gICAgLnNlcnZpY2UoJ0hlcmVNYXBzTWFya2VyU2VydmljZScsIHJlcXVpcmUoJy4vbWFya2Vycy5zZXJ2aWNlLmpzJykpOyIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKXtcbiAgICBmdW5jdGlvbiBNYXJrZXJJbnRlcmZhY2UoKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdBYnN0cmFjdCBjbGFzcyEgVGhlIEluc3RhbmNlIHNob3VsZCBiZSBjcmVhdGVkJyk7XG4gICAgfVxuICAgIFxuICAgIHZhciBwcm90byA9IE1hcmtlckludGVyZmFjZS5wcm90b3R5cGU7XG4gICAgXG4gICAgcHJvdG8uY3JlYXRlID0gY3JlYXRlO1xuICAgIHByb3RvLnNldENvb3JkcyA9IHNldENvb3JkcztcbiAgICBwcm90by5hZGRJbmZvQnViYmxlID0gYWRkSW5mb0J1YmJsZTtcbiAgICBcbiAgICBmdW5jdGlvbiBNYXJrZXIoKXt9XG4gICAgXG4gICAgTWFya2VyLnByb3RvdHlwZSA9IHByb3RvO1xuICAgIFxuICAgIHJldHVybiBNYXJrZXI7XG4gICAgXG4gICAgZnVuY3Rpb24gY3JlYXRlKCl7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignY3JlYXRlOjogbm90IGltcGxlbWVudGVkJyk7IFxuICAgIH1cbiAgICBcbiAgICBmdW5jdGlvbiBzZXRDb29yZHMoKXtcbiAgICAgICAgIHRoaXMuY29vcmRzID0ge1xuICAgICAgICAgICAgbGF0OiB0aGlzLnBsYWNlLnBvcy5sYXQsXG4gICAgICAgICAgICBsbmc6IHRoaXMucGxhY2UucG9zLmxuZ1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIGZ1bmN0aW9uIGFkZEluZm9CdWJibGUobWFya2VyKXtcbiAgICAgICAgaWYoIXRoaXMucGxhY2UucG9wdXApXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBcbiAgICAgICAgbWFya2VyLnNldERhdGEodGhpcy5wbGFjZS5wb3B1cClcbiAgICB9XG59IiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc01hcmtlclNlcnZpY2U7XG5cbkhlcmVNYXBzTWFya2VyU2VydmljZS4kaW5qZWN0ID0gW1xuICAgICdIZXJlTWFwc0RlZmF1bHRNYXJrZXInLFxuICAgICdIZXJlTWFwc0RPTU1hcmtlcicsXG4gICAgJ0hlcmVNYXBzU1ZHTWFya2VyJyxcbiAgICAnSGVyZU1hcHNDT05TVFMnXG5dO1xuZnVuY3Rpb24gSGVyZU1hcHNNYXJrZXJTZXJ2aWNlKEhlcmVNYXBzRGVmYXVsdE1hcmtlciwgSGVyZU1hcHNET01NYXJrZXIsIEhlcmVNYXBzU1ZHTWFya2VyLCBIZXJlTWFwc0NPTlNUUykge1xuICAgIHZhciBNQVJLRVJfVFlQRVMgPSBIZXJlTWFwc0NPTlNUUy5NQVJLRVJfVFlQRVM7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBhZGRNYXJrZXJzVG9NYXA6IGFkZE1hcmtlcnNUb01hcCxcbiAgICAgICAgYWRkVXNlck1hcmtlcjogYWRkVXNlck1hcmtlcixcbiAgICAgICAgdXBkYXRlTWFya2VyczogdXBkYXRlTWFya2VycyxcbiAgICAgICAgaXNNYXJrZXJJbnN0YW5jZTogaXNNYXJrZXJJbnN0YW5jZSxcbiAgICAgICAgc2V0Vmlld0JvdW5kczogc2V0Vmlld0JvdW5kc1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzTWFya2VySW5zdGFuY2UodGFyZ2V0KSB7XG4gICAgICAgIHJldHVybiB0YXJnZXQgaW5zdGFuY2VvZiBILm1hcC5NYXJrZXIgfHwgdGFyZ2V0IGluc3RhbmNlb2YgSC5tYXAuRG9tTWFya2VyO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFkZFVzZXJNYXJrZXIobWFwLCBwbGFjZSkge1xuICAgICAgICBpZiAobWFwLnVzZXJNYXJrZXIpXG4gICAgICAgICAgICByZXR1cm4gbWFwLnVzZXJNYXJrZXI7XG5cbiAgICAgICAgcGxhY2UubWFya3VwID0gJzxzdmcgd2lkdGg9XCIzNXB4XCIgaGVpZ2h0PVwiMzVweFwiIHZpZXdCb3g9XCIwIDAgOTAgOTBcIiB2ZXJzaW9uPVwiMS4xXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHhtbG5zOnhsaW5rPVwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGlua1wiPicgK1xuICAgICAgICAgICAgJzxkZWZzPjxjaXJjbGUgaWQ9XCJwYXRoLTFcIiBjeD1cIjMwMlwiIGN5PVwiODAyXCIgcj1cIjE1XCI+PC9jaXJjbGU+JyArXG4gICAgICAgICAgICAnPG1hc2sgaWQ9XCJtYXNrLTJcIiBtYXNrQ29udGVudFVuaXRzPVwidXNlclNwYWNlT25Vc2VcIiBtYXNrVW5pdHM9XCJvYmplY3RCb3VuZGluZ0JveFwiIHg9XCItMzBcIiB5PVwiLTMwXCIgd2lkdGg9XCI5MFwiIGhlaWdodD1cIjkwXCI+JyArXG4gICAgICAgICAgICAnPHJlY3QgeD1cIjI1N1wiIHk9XCI3NTdcIiB3aWR0aD1cIjkwXCIgaGVpZ2h0PVwiOTBcIiBmaWxsPVwid2hpdGVcIj48L3JlY3Q+PHVzZSB4bGluazpocmVmPVwiI3BhdGgtMVwiIGZpbGw9XCJibGFja1wiPjwvdXNlPicgK1xuICAgICAgICAgICAgJzwvbWFzaz48L2RlZnM+PGcgaWQ9XCJQYWdlLTFcIiBzdHJva2U9XCJub25lXCIgc3Ryb2tlLXdpZHRoPVwiMVwiIGZpbGw9XCJub25lXCIgZmlsbC1ydWxlPVwiZXZlbm9kZFwiPicgK1xuICAgICAgICAgICAgJzxnIGlkPVwiU2VydmljZS1PcHRpb25zLS0tZGlyZWN0aW9ucy0tLW1hcFwiIHRyYW5zZm9ybT1cInRyYW5zbGF0ZSgtMjU3LjAwMDAwMCwgLTc1Ny4wMDAwMDApXCI+PGcgaWQ9XCJPdmFsLTE1XCI+JyArXG4gICAgICAgICAgICAnPHVzZSBmaWxsPVwiI0ZGRkZGRlwiIGZpbGwtcnVsZT1cImV2ZW5vZGRcIiB4bGluazpocmVmPVwiI3BhdGgtMVwiPjwvdXNlPicgK1xuICAgICAgICAgICAgJzx1c2Ugc3Ryb2tlLW9wYWNpdHk9XCIwLjI5NjEzOTA0XCIgc3Ryb2tlPVwiIzNGMzRBMFwiIG1hc2s9XCJ1cmwoI21hc2stMilcIiBzdHJva2Utd2lkdGg9XCI2MFwiIHhsaW5rOmhyZWY9XCIjcGF0aC0xXCI+PC91c2U+JyArXG4gICAgICAgICAgICAnPHVzZSBzdHJva2U9XCIjM0YzNEEwXCIgc3Ryb2tlLXdpZHRoPVwiNVwiIHhsaW5rOmhyZWY9XCIjcGF0aC0xXCI+PC91c2U+PC9nPjwvZz48L2c+PC9zdmc+JztcblxuICAgICAgICBtYXAudXNlck1hcmtlciA9IG5ldyBIZXJlTWFwc1NWR01hcmtlcihwbGFjZSkuY3JlYXRlKCk7XG5cbiAgICAgICAgbWFwLmFkZE9iamVjdChtYXAudXNlck1hcmtlcik7XG5cbiAgICAgICAgcmV0dXJuIG1hcC51c2VyTWFya2VyO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFkZE1hcmtlcnNUb01hcChtYXAsIHBsYWNlcywgcmVmcmVzaFZpZXdib3VuZHMpIHtcbiAgICAgICAgaWYgKCFwbGFjZXMgfHwgIXBsYWNlcy5sZW5ndGgpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKCEobWFwIGluc3RhbmNlb2YgSC5NYXApKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBtYXAgaW5zdGFuY2UnKTtcblxuICAgICAgICBpZiAoIW1hcC5tYXJrZXJzR3JvdXApXG4gICAgICAgICAgICBtYXAubWFya2Vyc0dyb3VwID0gbmV3IEgubWFwLkdyb3VwKCk7XG5cbiAgICAgICAgcGxhY2VzLmZvckVhY2goZnVuY3Rpb24gKHBsYWNlLCBpKSB7XG4gICAgICAgICAgICB2YXIgY3JlYXRvciA9IF9nZXRNYXJrZXJDcmVhdG9yKHBsYWNlKSxcbiAgICAgICAgICAgICAgICBtYXJrZXIgPSBwbGFjZS5kcmFnZ2FibGUgPyBfZHJhZ2dhYmxlTWFya2VyTWl4aW4oY3JlYXRvci5jcmVhdGUoKSkgOiBjcmVhdG9yLmNyZWF0ZSgpO1xuXG4gICAgICAgICAgICBtYXAubWFya2Vyc0dyb3VwLmFkZE9iamVjdChtYXJrZXIpO1xuICAgICAgICB9KTtcblxuICAgICAgICBtYXAuYWRkT2JqZWN0KG1hcC5tYXJrZXJzR3JvdXApO1xuXG4gICAgICAgIGlmIChyZWZyZXNoVmlld2JvdW5kcykge1xuICAgICAgICAgICAgc2V0Vmlld0JvdW5kcyhtYXAsIG1hcC5tYXJrZXJzR3JvdXAuZ2V0Qm91bmRpbmdCb3goKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRWaWV3Qm91bmRzKG1hcCwgYm91bmRzLCBvcHRfYW5pbWF0ZSkge1xuICAgICAgICBtYXAuZ2V0Vmlld01vZGVsKCkuc2V0TG9va0F0RGF0YShib3VuZHMsICEhb3B0X2FuaW1hdGUpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZU1hcmtlcnMobWFwLCBwbGFjZXMsIHJlZnJlc2hWaWV3Ym91bmRzKSB7XG4gICAgICAgIGlmIChtYXAubWFya2Vyc0dyb3VwKSB7XG4gICAgICAgICAgICBtYXAubWFya2Vyc0dyb3VwLnJlbW92ZUFsbCgpO1xuICAgICAgICAgICAgbWFwLnJlbW92ZU9iamVjdChtYXAubWFya2Vyc0dyb3VwKTtcbiAgICAgICAgICAgIG1hcC5tYXJrZXJzR3JvdXAgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgYWRkTWFya2Vyc1RvTWFwLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2dldE1hcmtlckNyZWF0b3IocGxhY2UpIHtcbiAgICAgICAgdmFyIENvbmNyZXRlTWFya2VyLFxuICAgICAgICAgICAgdHlwZSA9IHBsYWNlLnR5cGUgPyBwbGFjZS50eXBlLnRvVXBwZXJDYXNlKCkgOiBudWxsO1xuXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSBNQVJLRVJfVFlQRVMuRE9NOlxuICAgICAgICAgICAgICAgIENvbmNyZXRlTWFya2VyID0gSGVyZU1hcHNET01NYXJrZXI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIE1BUktFUl9UWVBFUy5TVkc6XG4gICAgICAgICAgICAgICAgQ29uY3JldGVNYXJrZXIgPSBIZXJlTWFwc1NWR01hcmtlcjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgQ29uY3JldGVNYXJrZXIgPSBIZXJlTWFwc0RlZmF1bHRNYXJrZXI7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IENvbmNyZXRlTWFya2VyKHBsYWNlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfZHJhZ2dhYmxlTWFya2VyTWl4aW4obWFya2VyKSB7XG4gICAgICAgIG1hcmtlci5kcmFnZ2FibGUgPSB0cnVlO1xuXG4gICAgICAgIHJldHVybiBtYXJrZXI7XG4gICAgfVxufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gSGVyZU1hcHNTVkdNYXJrZXI7XG5cbkhlcmVNYXBzU1ZHTWFya2VyLiRpbmplY3QgPSBbJ0hlcmVNYXBzTWFya2VySW50ZXJmYWNlJ107XG5mdW5jdGlvbiBIZXJlTWFwc1NWR01hcmtlcihIZXJlTWFwc01hcmtlckludGVyZmFjZSl7XG4gICAgZnVuY3Rpb24gU1ZHTWFya2VyKHBsYWNlKXtcbiAgICAgICAgdGhpcy5wbGFjZSA9IHBsYWNlO1xuICAgICAgICB0aGlzLnNldENvb3JkcygpO1xuICAgIH1cbiAgICBcbiAgICB2YXIgcHJvdG8gPSBTVkdNYXJrZXIucHJvdG90eXBlID0gbmV3IEhlcmVNYXBzTWFya2VySW50ZXJmYWNlKCk7XG4gICAgcHJvdG8uY29uc3RydWN0b3IgPSBTVkdNYXJrZXI7XG4gICAgXG4gICAgcHJvdG8uY3JlYXRlID0gY3JlYXRlO1xuICAgIHByb3RvLmdldEljb24gPSBnZXRJY29uO1xuICAgIFxuICAgIHJldHVybiBTVkdNYXJrZXI7XG4gICAgXG4gICAgZnVuY3Rpb24gY3JlYXRlKCl7XG4gICAgICAgIHZhciBtYXJrZXIgPSBuZXcgSC5tYXAuTWFya2VyKHRoaXMuY29vcmRzLCB7XG4gICAgICAgICAgICBpY29uOiB0aGlzLmdldEljb24oKSxcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmFkZEluZm9CdWJibGUobWFya2VyKTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBtYXJrZXI7XG4gICAgfVxuICAgIFxuICAgIGZ1bmN0aW9uIGdldEljb24oKXtcbiAgICAgICAgdmFyIGljb24gPSB0aGlzLnBsYWNlLm1hcmt1cDtcbiAgICAgICAgIGlmKCFpY29uKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXJrdXAgbWlzc2VkJyk7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBILm1hcC5JY29uKGljb24pO1xuICAgIH1cbn0iLCJtb2R1bGUuZXhwb3J0cyA9IGFuZ3VsYXIubW9kdWxlKCdoZXJlbWFwcy1yb3V0ZXMtbW9kdWxlJywgW10pXG4gICAgICAgICAgICAgICAgICAgIC5zZXJ2aWNlKCdIZXJlTWFwc1JvdXRlc1NlcnZpY2UnLCByZXF1aXJlKCcuL3JvdXRlcy5zZXJ2aWNlLmpzJykpOyAgIiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc1JvdXRlc1NlcnZpY2U7XG5cbkhlcmVNYXBzUm91dGVzU2VydmljZS4kaW5qZWN0ID0gWyckcScsICdIZXJlTWFwc01hcmtlclNlcnZpY2UnXTtcbmZ1bmN0aW9uIEhlcmVNYXBzUm91dGVzU2VydmljZSgkcSwgSGVyZU1hcHNNYXJrZXJTZXJ2aWNlKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY2FsY3VsYXRlUm91dGU6IGNhbGN1bGF0ZVJvdXRlLFxuICAgICAgICBhZGRSb3V0ZVRvTWFwOiBhZGRSb3V0ZVRvTWFwLFxuICAgICAgICBjbGVhblJvdXRlczogY2xlYW5Sb3V0ZXNcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjYWxjdWxhdGVSb3V0ZShoZXJlbWFwcywgY29uZmlnKSB7XG4gICAgICAgIHZhciBwbGF0Zm9ybSA9IGhlcmVtYXBzLnBsYXRmb3JtLFxuICAgICAgICAgICAgbWFwID0gaGVyZW1hcHMubWFwLFxuICAgICAgICAgICAgcm91dGVyID0gcGxhdGZvcm0uZ2V0Um91dGluZ1NlcnZpY2UoKSxcbiAgICAgICAgICAgIGRpciA9IGNvbmZpZy5kaXJlY3Rpb24sXG4gICAgICAgICAgICB3YXlwb2ludHMgPSBkaXIud2F5cG9pbnRzO1xuXG4gICAgICAgIHZhciBtb2RlID0gJ3t7TU9ERX19O3t7VkVDSElMRX19J1xuICAgICAgICAgICAgLnJlcGxhY2UoL3t7TU9ERX19LywgZGlyLm1vZGUgfHwgJ2Zhc3Rlc3QnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL3t7VkVDSElMRX19LywgY29uZmlnLmRyaXZlVHlwZSk7XG5cbiAgICAgICAgdmFyIHJvdXRlUmVxdWVzdFBhcmFtcyA9IHtcbiAgICAgICAgICAgIG1vZGU6IG1vZGUsXG4gICAgICAgICAgICByZXByZXNlbnRhdGlvbjogZGlyLnJlcHJlc2VudGF0aW9uIHx8ICdkaXNwbGF5JyxcbiAgICAgICAgICAgIGxhbmd1YWdlOiBkaXIubGFuZ3VhZ2UgfHwgJ2VuLWdiJ1xuICAgICAgICB9O1xuXG4gICAgICAgIHdheXBvaW50cy5mb3JFYWNoKGZ1bmN0aW9uICh3YXlwb2ludCwgaSkge1xuICAgICAgICAgICAgcm91dGVSZXF1ZXN0UGFyYW1zW1wid2F5cG9pbnRcIiArIGldID0gW3dheXBvaW50LmxhdCwgd2F5cG9pbnQubG5nXS5qb2luKCcsJyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIF9zZXRBdHRyaWJ1dGVzKHJvdXRlUmVxdWVzdFBhcmFtcywgZGlyLmF0dHJzKTtcblxuICAgICAgICB2YXIgZGVmZXJyZWQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIHJvdXRlci5jYWxjdWxhdGVSb3V0ZShyb3V0ZVJlcXVlc3RQYXJhbXMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGVhblJvdXRlcyhtYXApIHtcbiAgICAgICAgdmFyIGdyb3VwID0gbWFwLnJvdXRlc0dyb3VwO1xuXG4gICAgICAgIGlmICghZ3JvdXApXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgZ3JvdXAucmVtb3ZlQWxsKCk7XG4gICAgICAgIG1hcC5yZW1vdmVPYmplY3QoZ3JvdXApO1xuICAgICAgICBtYXAucm91dGVzR3JvdXAgPSBudWxsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFkZFJvdXRlVG9NYXAobWFwLCByb3V0ZURhdGEsIGNsZWFuKSB7XG4gICAgICAgIGlmIChjbGVhbilcbiAgICAgICAgICAgIGNsZWFuUm91dGVzKG1hcCk7XG5cbiAgICAgICAgdmFyIHJvdXRlID0gcm91dGVEYXRhLnJvdXRlO1xuXG4gICAgICAgIGlmICghbWFwIHx8ICFyb3V0ZSB8fCAhcm91dGUuc2hhcGUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHN0cmlwID0gbmV3IEguZ2VvLkxpbmVTdHJpbmcoKSwgcG9seWxpbmUgPSBudWxsO1xuXG4gICAgICAgIHJvdXRlLnNoYXBlLmZvckVhY2goZnVuY3Rpb24gKHBvaW50KSB7XG4gICAgICAgICAgICB2YXIgcGFydHMgPSBwb2ludC5zcGxpdCgnLCcpO1xuICAgICAgICAgICAgc3RyaXAucHVzaExhdExuZ0FsdChwYXJ0c1swXSwgcGFydHNbMV0pO1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgc3R5bGUgPSByb3V0ZURhdGEuc3R5bGUgfHwge307XG5cbiAgICAgICAgcG9seWxpbmUgPSBuZXcgSC5tYXAuUG9seWxpbmUoc3RyaXAsIHtcbiAgICAgICAgICAgIHN0eWxlOiB7XG4gICAgICAgICAgICAgICAgbGluZVdpZHRoOiBzdHlsZS5saW5lV2lkdGggfHwgNCxcbiAgICAgICAgICAgICAgICBzdHJva2VDb2xvcjogc3R5bGUuY29sb3IgfHwgJ3JnYmEoMCwgMTI4LCAyNTUsIDAuNyknXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBncm91cCA9IG1hcC5yb3V0ZXNHcm91cDtcblxuICAgICAgICBpZiAoIWdyb3VwKSB7XG4gICAgICAgICAgICBncm91cCA9IG1hcC5yb3V0ZXNHcm91cCA9IG5ldyBILm1hcC5Hcm91cCgpO1xuICAgICAgICAgICAgbWFwLmFkZE9iamVjdChncm91cCk7XG4gICAgICAgIH1cblxuICAgICAgICBncm91cC5hZGRPYmplY3QocG9seWxpbmUpO1xuXG4gICAgICAgIGlmKHJvdXRlRGF0YS56b29tVG9Cb3VuZHMpIHtcbiAgICAgICAgICAgIEhlcmVNYXBzTWFya2VyU2VydmljZS5zZXRWaWV3Qm91bmRzKG1hcCwgcG9seWxpbmUuZ2V0Qm91bmRpbmdCb3goKSwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyNyZWdpb24gUFJJVkFURVxuXG4gICAgZnVuY3Rpb24gX3NldEF0dHJpYnV0ZXMocGFyYW1zLCBhdHRycykge1xuICAgICAgICB2YXIgX2tleSA9ICdhdHRyaWJ1dGVzJztcbiAgICAgICAgZm9yICh2YXIga2V5IGluIGF0dHJzKSB7XG4gICAgICAgICAgICBpZiAoIWF0dHJzLmhhc093blByb3BlcnR5KGtleSkpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIHBhcmFtc1trZXkgKyBfa2V5XSA9IGF0dHJzW2tleV07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgc2VyaWVzIG9mIEgubWFwLk1hcmtlciBwb2ludHMgZnJvbSB0aGUgcm91dGUgYW5kIGFkZHMgdGhlbSB0byB0aGUgbWFwLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSByb3V0ZSAgQSByb3V0ZSBhcyByZWNlaXZlZCBmcm9tIHRoZSBILnNlcnZpY2UuUm91dGluZ1NlcnZpY2VcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhZGRNYW51ZXZlcnNUb01hcChtYXAsIHJvdXRlKSB7XG4gICAgICAgIHZhciBzdmdNYXJrdXAgPSAnPHN2ZyB3aWR0aD1cIjE4XCIgaGVpZ2h0PVwiMThcIiAnICtcbiAgICAgICAgICAgICd4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCI+JyArXG4gICAgICAgICAgICAnPGNpcmNsZSBjeD1cIjhcIiBjeT1cIjhcIiByPVwiOFwiICcgK1xuICAgICAgICAgICAgJ2ZpbGw9XCIjMWI0NjhkXCIgc3Ryb2tlPVwid2hpdGVcIiBzdHJva2Utd2lkdGg9XCIxXCIgIC8+JyArXG4gICAgICAgICAgICAnPC9zdmc+JyxcbiAgICAgICAgICAgIGRvdEljb24gPSBuZXcgSC5tYXAuSWNvbihzdmdNYXJrdXAsIHsgYW5jaG9yOiB7IHg6IDgsIHk6IDggfSB9KSxcbiAgICAgICAgICAgIGdyb3VwID0gbmV3IEgubWFwLkdyb3VwKCksIGksIGo7XG5cbiAgICAgICAgLy8gQWRkIGEgbWFya2VyIGZvciBlYWNoIG1hbmV1dmVyXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3V0ZS5sZWcubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCByb3V0ZS5sZWdbaV0ubWFuZXV2ZXIubGVuZ3RoOyBqICs9IDEpIHtcbiAgICAgICAgICAgICAgICAvLyBHZXQgdGhlIG5leHQgbWFuZXV2ZXIuXG4gICAgICAgICAgICAgICAgbWFuZXV2ZXIgPSByb3V0ZS5sZWdbaV0ubWFuZXV2ZXJbal07XG4gICAgICAgICAgICAgICAgLy8gQWRkIGEgbWFya2VyIHRvIHRoZSBtYW5ldXZlcnMgZ3JvdXBcbiAgICAgICAgICAgICAgICB2YXIgbWFya2VyID0gbmV3IEgubWFwLk1hcmtlcih7XG4gICAgICAgICAgICAgICAgICAgIGxhdDogbWFuZXV2ZXIucG9zaXRpb24ubGF0aXR1ZGUsXG4gICAgICAgICAgICAgICAgICAgIGxuZzogbWFuZXV2ZXIucG9zaXRpb24ubG9uZ2l0dWRlXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBpY29uOiBkb3RJY29uIH1cbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgbWFya2VyLmluc3RydWN0aW9uID0gbWFuZXV2ZXIuaW5zdHJ1Y3Rpb247XG4gICAgICAgICAgICAgICAgZ3JvdXAuYWRkT2JqZWN0KG1hcmtlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBncm91cC5hZGRFdmVudExpc3RlbmVyKCd0YXAnLCBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgICAgICBtYXAuc2V0Q2VudGVyKGV2dC50YXJnZXQuZ2V0UG9zaXRpb24oKSk7XG4gICAgICAgICAgICBvcGVuQnViYmxlKGV2dC50YXJnZXQuZ2V0UG9zaXRpb24oKSwgZXZ0LnRhcmdldC5pbnN0cnVjdGlvbik7XG4gICAgICAgIH0sIGZhbHNlKTtcblxuICAgICAgICAvLyBBZGQgdGhlIG1hbmV1dmVycyBncm91cCB0byB0aGUgbWFwXG4gICAgICAgIG1hcC5hZGRPYmplY3QoZ3JvdXApO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIHNlcmllcyBvZiBILm1hcC5NYXJrZXIgcG9pbnRzIGZyb20gdGhlIHJvdXRlIGFuZCBhZGRzIHRoZW0gdG8gdGhlIG1hcC5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcm91dGUgIEEgcm91dGUgYXMgcmVjZWl2ZWQgZnJvbSB0aGUgSC5zZXJ2aWNlLlJvdXRpbmdTZXJ2aWNlXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkV2F5cG9pbnRzVG9QYW5lbCh3YXlwb2ludHMpIHtcbiAgICAgICAgdmFyIG5vZGVIMyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2gzJyksXG4gICAgICAgICAgICB3YXlwb2ludExhYmVscyA9IFtdLFxuICAgICAgICAgICAgaTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICB3YXlwb2ludExhYmVscy5wdXNoKHdheXBvaW50c1tpXS5sYWJlbClcbiAgICAgICAgfVxuXG4gICAgICAgIG5vZGVIMy50ZXh0Q29udGVudCA9IHdheXBvaW50TGFiZWxzLmpvaW4oJyAtICcpO1xuXG4gICAgICAgIHJvdXRlSW5zdHJ1Y3Rpb25zQ29udGFpbmVyLmlubmVySFRNTCA9ICcnO1xuICAgICAgICByb3V0ZUluc3RydWN0aW9uc0NvbnRhaW5lci5hcHBlbmRDaGlsZChub2RlSDMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBzZXJpZXMgb2YgSC5tYXAuTWFya2VyIHBvaW50cyBmcm9tIHRoZSByb3V0ZSBhbmQgYWRkcyB0aGVtIHRvIHRoZSBtYXAuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHJvdXRlICBBIHJvdXRlIGFzIHJlY2VpdmVkIGZyb20gdGhlIEguc2VydmljZS5Sb3V0aW5nU2VydmljZVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGFkZFN1bW1hcnlUb1BhbmVsKHN1bW1hcnkpIHtcbiAgICAgICAgdmFyIHN1bW1hcnlEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcbiAgICAgICAgICAgIGNvbnRlbnQgPSAnJztcblxuICAgICAgICBjb250ZW50ICs9ICc8Yj5Ub3RhbCBkaXN0YW5jZTwvYj46ICcgKyBzdW1tYXJ5LmRpc3RhbmNlICsgJ20uIDxici8+JztcbiAgICAgICAgY29udGVudCArPSAnPGI+VHJhdmVsIFRpbWU8L2I+OiAnICsgc3VtbWFyeS50cmF2ZWxUaW1lLnRvTU1TUygpICsgJyAoaW4gY3VycmVudCB0cmFmZmljKSc7XG5cblxuICAgICAgICBzdW1tYXJ5RGl2LnN0eWxlLmZvbnRTaXplID0gJ3NtYWxsJztcbiAgICAgICAgc3VtbWFyeURpdi5zdHlsZS5tYXJnaW5MZWZ0ID0gJzUlJztcbiAgICAgICAgc3VtbWFyeURpdi5zdHlsZS5tYXJnaW5SaWdodCA9ICc1JSc7XG4gICAgICAgIHN1bW1hcnlEaXYuaW5uZXJIVE1MID0gY29udGVudDtcbiAgICAgICAgcm91dGVJbnN0cnVjdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQoc3VtbWFyeURpdik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIHNlcmllcyBvZiBILm1hcC5NYXJrZXIgcG9pbnRzIGZyb20gdGhlIHJvdXRlIGFuZCBhZGRzIHRoZW0gdG8gdGhlIG1hcC5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcm91dGUgIEEgcm91dGUgYXMgcmVjZWl2ZWQgZnJvbSB0aGUgSC5zZXJ2aWNlLlJvdXRpbmdTZXJ2aWNlXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkTWFudWV2ZXJzVG9QYW5lbChyb3V0ZSkge1xuICAgICAgICB2YXIgbm9kZU9MID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb2wnKSwgaSwgajtcblxuICAgICAgICBub2RlT0wuc3R5bGUuZm9udFNpemUgPSAnc21hbGwnO1xuICAgICAgICBub2RlT0wuc3R5bGUubWFyZ2luTGVmdCA9ICc1JSc7XG4gICAgICAgIG5vZGVPTC5zdHlsZS5tYXJnaW5SaWdodCA9ICc1JSc7XG4gICAgICAgIG5vZGVPTC5jbGFzc05hbWUgPSAnZGlyZWN0aW9ucyc7XG5cbiAgICAgICAgLy8gQWRkIGEgbWFya2VyIGZvciBlYWNoIG1hbmV1dmVyXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3V0ZS5sZWcubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCByb3V0ZS5sZWdbaV0ubWFuZXV2ZXIubGVuZ3RoOyBqICs9IDEpIHtcbiAgICAgICAgICAgICAgICAvLyBHZXQgdGhlIG5leHQgbWFuZXV2ZXIuXG4gICAgICAgICAgICAgICAgbWFuZXV2ZXIgPSByb3V0ZS5sZWdbaV0ubWFuZXV2ZXJbal07XG5cbiAgICAgICAgICAgICAgICB2YXIgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpLFxuICAgICAgICAgICAgICAgICAgICBzcGFuQXJyb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyksXG4gICAgICAgICAgICAgICAgICAgIHNwYW5JbnN0cnVjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblxuICAgICAgICAgICAgICAgIHNwYW5BcnJvdy5jbGFzc05hbWUgPSAnYXJyb3cgJyArIG1hbmV1dmVyLmFjdGlvbjtcbiAgICAgICAgICAgICAgICBzcGFuSW5zdHJ1Y3Rpb24uaW5uZXJIVE1MID0gbWFuZXV2ZXIuaW5zdHJ1Y3Rpb247XG4gICAgICAgICAgICAgICAgbGkuYXBwZW5kQ2hpbGQoc3BhbkFycm93KTtcbiAgICAgICAgICAgICAgICBsaS5hcHBlbmRDaGlsZChzcGFuSW5zdHJ1Y3Rpb24pO1xuXG4gICAgICAgICAgICAgICAgbm9kZU9MLmFwcGVuZENoaWxkKGxpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJvdXRlSW5zdHJ1Y3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKG5vZGVPTCk7XG4gICAgfVxuXG59O1xuIl19
