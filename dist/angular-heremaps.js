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
            HereMapsAPIService.loadApi().then(_apiReady);
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
            var map = heremaps.map = new H.Map($element[0], heremaps.layers.normal.map, {
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
            var mapTileService = heremaps.platform.getMapTileService({ 'type': 'base' });

            // Create a tile layer which requests map tiles
            var newStyleLayer = mapTileService.createTileLayer(
                'maptile', 
                config.scheme || 'normal.day', 
                config.size || 256, 
                config.format || 'png8', 
                config.metadataQueryParams || {}
            );
            
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
                target.setPosition(self.map.screenToGeo(pointer.viewportX, pointer.viewportY));
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

        bubble.setPosition(data.position);
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
            position: target.getPosition(),
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

        this.ui.getControl(NAMES.SETTINGS).setIncidentsLayer(false);
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
                        self.userMarker.setPosition(position);
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
            setViewBounds(map, map.markersGroup.getBounds());
        }
    }

    function setViewBounds(map, bounds, opt_animate) {
        map.setViewBounds(bounds, !!opt_animate);
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

        var strip = new H.geo.Strip(), polyline = null;

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
            HereMapsMarkerService.setViewBounds(map, polyline.getBounds(), true);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvaGVyZW1hcHMuZGlyZWN0aXZlLmpzIiwic3JjL2luZGV4LmpzIiwic3JjL3Byb3ZpZGVycy9hcGkuc2VydmljZS5qcyIsInNyYy9wcm92aWRlcnMvY29uc3RzLmpzIiwic3JjL3Byb3ZpZGVycy9tYXAtbW9kdWxlcy9ldmVudHMvZXZlbnRzLmpzIiwic3JjL3Byb3ZpZGVycy9tYXAtbW9kdWxlcy9ldmVudHMvaW5mb2J1YmJsZS5qcyIsInNyYy9wcm92aWRlcnMvbWFwLW1vZHVsZXMvaW5kZXguanMiLCJzcmMvcHJvdmlkZXJzL21hcC1tb2R1bGVzL3VpL3VpLmpzIiwic3JjL3Byb3ZpZGVycy9tYXBjb25maWcucHJvdmlkZXIuanMiLCJzcmMvcHJvdmlkZXJzL21hcHV0aWxzLnNlcnZpY2UuanMiLCJzcmMvcHJvdmlkZXJzL21hcmtlcnMvZGVmYXVsdC5tYXJrZXIuanMiLCJzcmMvcHJvdmlkZXJzL21hcmtlcnMvZG9tLm1hcmtlci5qcyIsInNyYy9wcm92aWRlcnMvbWFya2Vycy9pbmRleC5qcyIsInNyYy9wcm92aWRlcnMvbWFya2Vycy9tYXJrZXIuanMiLCJzcmMvcHJvdmlkZXJzL21hcmtlcnMvbWFya2Vycy5zZXJ2aWNlLmpzIiwic3JjL3Byb3ZpZGVycy9tYXJrZXJzL3N2Zy5tYXJrZXIuanMiLCJzcmMvcHJvdmlkZXJzL3JvdXRlcy9pbmRleC5qcyIsInNyYy9wcm92aWRlcnMvcm91dGVzL3JvdXRlcy5zZXJ2aWNlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM1VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCJtb2R1bGUuZXhwb3J0cyA9IEhlcmVNYXBzRGlyZWN0aXZlO1xuXG5IZXJlTWFwc0RpcmVjdGl2ZS4kaW5qZWN0ID0gW1xuICAgICckdGltZW91dCcsXG4gICAgJyR3aW5kb3cnLFxuICAgICckcm9vdFNjb3BlJyxcbiAgICAnJGZpbHRlcicsXG4gICAgJ0hlcmVNYXBzQ29uZmlnJyxcbiAgICAnSGVyZU1hcHNBUElTZXJ2aWNlJyxcbiAgICAnSGVyZU1hcHNVdGlsc1NlcnZpY2UnLFxuICAgICdIZXJlTWFwc01hcmtlclNlcnZpY2UnLFxuICAgICdIZXJlTWFwc1JvdXRlc1NlcnZpY2UnLFxuICAgICdIZXJlTWFwc0NPTlNUUycsXG4gICAgJ0hlcmVNYXBzRXZlbnRzRmFjdG9yeScsXG4gICAgJ0hlcmVNYXBzVWlGYWN0b3J5J1xuXTtcbmZ1bmN0aW9uIEhlcmVNYXBzRGlyZWN0aXZlKFxuICAgICR0aW1lb3V0LFxuICAgICR3aW5kb3csXG4gICAgJHJvb3RTY29wZSxcbiAgICAkZmlsdGVyLFxuICAgIEhlcmVNYXBzQ29uZmlnLFxuICAgIEhlcmVNYXBzQVBJU2VydmljZSxcbiAgICBIZXJlTWFwc1V0aWxzU2VydmljZSxcbiAgICBIZXJlTWFwc01hcmtlclNlcnZpY2UsXG4gICAgSGVyZU1hcHNSb3V0ZXNTZXJ2aWNlLFxuICAgIEhlcmVNYXBzQ09OU1RTLFxuICAgIEhlcmVNYXBzRXZlbnRzRmFjdG9yeSxcbiAgICBIZXJlTWFwc1VpRmFjdG9yeSkge1xuXG4gICAgSGVyZU1hcHNEaXJlY3RpdmVDdHJsLiRpbmplY3QgPSBbJyRzY29wZScsICckZWxlbWVudCcsICckYXR0cnMnXTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnRUEnLFxuICAgICAgICB0ZW1wbGF0ZTogXCI8ZGl2IG5nLXN0eWxlPVxcXCJ7J3dpZHRoJzogbWFwV2lkdGgsICdoZWlnaHQnOiBtYXBIZWlnaHR9XFxcIj48L2Rpdj5cIixcbiAgICAgICAgcmVwbGFjZTogdHJ1ZSxcbiAgICAgICAgc2NvcGU6IHtcbiAgICAgICAgICAgIG9wdHM6ICcmb3B0aW9ucycsXG4gICAgICAgICAgICBwbGFjZXM6ICcmJyxcbiAgICAgICAgICAgIG9uTWFwUmVhZHk6IFwiJm1hcFJlYWR5XCIsXG4gICAgICAgICAgICBldmVudHM6ICcmJ1xuICAgICAgICB9LFxuICAgICAgICBjb250cm9sbGVyOiBIZXJlTWFwc0RpcmVjdGl2ZUN0cmxcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBIZXJlTWFwc0RpcmVjdGl2ZUN0cmwoJHNjb3BlLCAkZWxlbWVudCwgJGF0dHJzKSB7XG4gICAgICAgIHZhciBDT05UUk9MX05BTUVTID0gSGVyZU1hcHNDT05TVFMuQ09OVFJPTFMuTkFNRVMsXG4gICAgICAgICAgICBwbGFjZXMgPSAkc2NvcGUucGxhY2VzKCksXG4gICAgICAgICAgICBvcHRzID0gJHNjb3BlLm9wdHMoKSxcbiAgICAgICAgICAgIGxpc3RlbmVycyA9ICRzY29wZS5ldmVudHMoKTtcblxuICAgICAgICB2YXIgb3B0aW9ucyA9IGFuZ3VsYXIuZXh0ZW5kKHt9LCBIZXJlTWFwc0NPTlNUUy5ERUZBVUxUX01BUF9PUFRJT05TLCBvcHRzKSxcbiAgICAgICAgICAgIHBvc2l0aW9uID0gSGVyZU1hcHNVdGlsc1NlcnZpY2UuaXNWYWxpZENvb3JkcyhvcHRpb25zLmNvb3JkcykgP1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuY29vcmRzIDogSGVyZU1hcHNDT05TVFMuREVGQVVMVF9NQVBfT1BUSU9OUy5jb29yZHM7XG5cbiAgICAgICAgdmFyIGhlcmVtYXBzID0geyBpZDogSGVyZU1hcHNVdGlsc1NlcnZpY2UuZ2VuZXJhdGVJZCgpIH0sXG4gICAgICAgICAgICBtYXBSZWFkeSA9ICRzY29wZS5vbk1hcFJlYWR5KCksXG4gICAgICAgICAgICBfb25SZXNpemVNYXAgPSBudWxsO1xuXG4gICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBfc2V0TWFwU2l6ZSgpO1xuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIEhlcmVNYXBzQVBJU2VydmljZS5sb2FkQXBpKCkudGhlbihfYXBpUmVhZHkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBvcHRpb25zLnJlc2l6ZSAmJiBhZGRPblJlc2l6ZUxpc3RlbmVyKCk7XG5cbiAgICAgICAgJHNjb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIF9vblJlc2l6ZU1hcCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZ1bmN0aW9uIGFkZE9uUmVzaXplTGlzdGVuZXIoKSB7XG4gICAgICAgICAgICBfb25SZXNpemVNYXAgPSBIZXJlTWFwc1V0aWxzU2VydmljZS50aHJvdHRsZShfcmVzaXplSGFuZGxlciwgSGVyZU1hcHNDT05TVFMuVVBEQVRFX01BUF9SRVNJWkVfVElNRU9VVCk7XG4gICAgICAgICAgICAkd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIF9vblJlc2l6ZU1hcCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBfYXBpUmVhZHkoKSB7XG4gICAgICAgICAgICBfc2V0dXBNYXBQbGF0Zm9ybSgpO1xuICAgICAgICAgICAgX3NldHVwTWFwKCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBfc2V0dXBNYXBQbGF0Zm9ybSgpIHtcbiAgICAgICAgICAgIGlmICghSGVyZU1hcHNDb25maWcuYXBwX2lkIHx8ICghSGVyZU1hcHNDb25maWcuYXBwX2NvZGUgJiYgIUhlcmVNYXBzQ29uZmlnLmFwaUtleSkpXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdhcHBfaWQgb3IgZWl0aGVyIG9mIGFwcF9jb2RlIGFuZCBhcGlLZXkgd2VyZSBtaXNzZWQuIFBsZWFzZSBzcGVjaWZ5IHRoZWlyIGluIEhlcmVNYXBzQ29uZmlnJyk7XG5cbiAgICAgICAgICAgIGhlcmVtYXBzLnBsYXRmb3JtID0gbmV3IEguc2VydmljZS5QbGF0Zm9ybShIZXJlTWFwc0NvbmZpZyk7XG4gICAgICAgICAgICBoZXJlbWFwcy5sYXllcnMgPSBoZXJlbWFwcy5wbGF0Zm9ybS5jcmVhdGVEZWZhdWx0TGF5ZXJzKCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBfZ2V0TG9jYXRpb24oZW5hYmxlSGlnaEFjY3VyYWN5LCBtYXhpbXVtQWdlKSB7XG4gICAgICAgICAgICB2YXIgX2VuYWJsZUhpZ2hBY2N1cmFjeSA9ICEhZW5hYmxlSGlnaEFjY3VyYWN5LFxuICAgICAgICAgICAgICAgIF9tYXhpbXVtQWdlID0gbWF4aW11bUFnZSB8fCAwO1xuXG4gICAgICAgICAgICByZXR1cm4gSGVyZU1hcHNBUElTZXJ2aWNlLmdldFBvc2l0aW9uKHtcbiAgICAgICAgICAgICAgICBlbmFibGVIaWdoQWNjdXJhY3k6IF9lbmFibGVIaWdoQWNjdXJhY3ksXG4gICAgICAgICAgICAgICAgbWF4aW11bUFnZTogX21heGltdW1BZ2VcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gX2xvY2F0aW9uRmFpbHVyZSgpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0NhbiBub3QgZ2V0IGEgZ2VvIHBvc2l0aW9uJyk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBfc2V0dXBNYXAoKSB7XG4gICAgICAgICAgICBfaW5pdE1hcChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgSGVyZU1hcHNBUElTZXJ2aWNlLmxvYWRNb2R1bGVzKCRhdHRycy4kYXR0ciwge1xuICAgICAgICAgICAgICAgICAgICBcImNvbnRyb2xzXCI6IF91aU1vZHVsZVJlYWR5LFxuICAgICAgICAgICAgICAgICAgICBcImV2ZW50c1wiOiBfZXZlbnRzTW9kdWxlUmVhZHlcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gX2luaXRNYXAoY2IpIHtcbiAgICAgICAgICAgIHZhciBtYXAgPSBoZXJlbWFwcy5tYXAgPSBuZXcgSC5NYXAoJGVsZW1lbnRbMF0sIGhlcmVtYXBzLmxheWVycy5ub3JtYWwubWFwLCB7XG4gICAgICAgICAgICAgICAgem9vbTogSGVyZU1hcHNVdGlsc1NlcnZpY2UuaXNWYWxpZENvb3Jkcyhwb3NpdGlvbikgPyBvcHRpb25zLnpvb20gOiBvcHRpb25zLm1heFpvb20sXG4gICAgICAgICAgICAgICAgY2VudGVyOiBuZXcgSC5nZW8uUG9pbnQocG9zaXRpb24ubGF0aXR1ZGUsIHBvc2l0aW9uLmxvbmdpdHVkZSlcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBIZXJlTWFwc01hcmtlclNlcnZpY2UuYWRkTWFya2Vyc1RvTWFwKG1hcCwgcGxhY2VzLCB0cnVlKTtcblxuICAgICAgICAgICAgaWYgKEhlcmVNYXBzQ29uZmlnLm1hcFRpbGVDb25maWcpXG4gICAgICAgICAgICAgICAgX3NldEN1c3RvbU1hcFN0eWxlcyhtYXAsIEhlcmVNYXBzQ29uZmlnLm1hcFRpbGVDb25maWcpO1xuXG4gICAgICAgICAgICBtYXBSZWFkeSAmJiBtYXBSZWFkeShNYXBQcm94eSgpKTtcblxuICAgICAgICAgICAgY2IgJiYgY2IoKTtcblxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gX3VpTW9kdWxlUmVhZHkoKSB7XG4gICAgICAgICAgICBIZXJlTWFwc1VpRmFjdG9yeS5zdGFydCh7XG4gICAgICAgICAgICAgICAgcGxhdGZvcm06IGhlcmVtYXBzLFxuICAgICAgICAgICAgICAgIGFsaWdubWVudDogJGF0dHJzLmNvbnRyb2xzXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIF9ldmVudHNNb2R1bGVSZWFkeSgpIHtcbiAgICAgICAgICAgIEhlcmVNYXBzRXZlbnRzRmFjdG9yeS5zdGFydCh7XG4gICAgICAgICAgICAgICAgcGxhdGZvcm06IGhlcmVtYXBzLFxuICAgICAgICAgICAgICAgIGxpc3RlbmVyczogbGlzdGVuZXJzLFxuICAgICAgICAgICAgICAgIG9wdGlvbnM6IG9wdGlvbnMsXG4gICAgICAgICAgICAgICAgaW5qZWN0b3I6IF9tb2R1bGVJbmplY3RvclxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBfbW9kdWxlSW5qZWN0b3IoKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhlcmVtYXBzW2lkXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIF9yZXNpemVIYW5kbGVyKGhlaWdodCwgd2lkdGgpIHtcbiAgICAgICAgICAgIF9zZXRNYXBTaXplLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG5cbiAgICAgICAgICAgIGhlcmVtYXBzLm1hcC5nZXRWaWV3UG9ydCgpLnJlc2l6ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gX3NldE1hcFNpemUoaGVpZ2h0LCB3aWR0aCkge1xuICAgICAgICAgICAgdmFyIGhlaWdodCA9IGhlaWdodCB8fCAkZWxlbWVudFswXS5wYXJlbnROb2RlLm9mZnNldEhlaWdodCB8fCBvcHRpb25zLmhlaWdodCxcbiAgICAgICAgICAgICAgICB3aWR0aCA9IHdpZHRoIHx8ICRlbGVtZW50WzBdLnBhcmVudE5vZGUub2Zmc2V0V2lkdGggfHwgb3B0aW9ucy53aWR0aDtcblxuICAgICAgICAgICAgJHNjb3BlLm1hcEhlaWdodCA9IGhlaWdodCArICdweCc7XG4gICAgICAgICAgICAkc2NvcGUubWFwV2lkdGggPSB3aWR0aCArICdweCc7XG5cbiAgICAgICAgICAgIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLnJ1blNjb3BlRGlnZXN0SWZOZWVkKCRzY29wZSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZ1bmN0aW9uIF9zZXRDdXN0b21NYXBTdHlsZXMobWFwLCBjb25maWcpIHtcbiAgICAgICAgICAgIC8vIENyZWF0ZSBhIE1hcFRpbGVTZXJ2aWNlIGluc3RhbmNlIHRvIHJlcXVlc3QgYmFzZSB0aWxlcyAoaS5lLiBiYXNlLm1hcC5hcGkuaGVyZS5jb20pOlxuICAgICAgICAgICAgdmFyIG1hcFRpbGVTZXJ2aWNlID0gaGVyZW1hcHMucGxhdGZvcm0uZ2V0TWFwVGlsZVNlcnZpY2UoeyAndHlwZSc6ICdiYXNlJyB9KTtcblxuICAgICAgICAgICAgLy8gQ3JlYXRlIGEgdGlsZSBsYXllciB3aGljaCByZXF1ZXN0cyBtYXAgdGlsZXNcbiAgICAgICAgICAgIHZhciBuZXdTdHlsZUxheWVyID0gbWFwVGlsZVNlcnZpY2UuY3JlYXRlVGlsZUxheWVyKFxuICAgICAgICAgICAgICAgICdtYXB0aWxlJywgXG4gICAgICAgICAgICAgICAgY29uZmlnLnNjaGVtZSB8fCAnbm9ybWFsLmRheScsIFxuICAgICAgICAgICAgICAgIGNvbmZpZy5zaXplIHx8IDI1NiwgXG4gICAgICAgICAgICAgICAgY29uZmlnLmZvcm1hdCB8fCAncG5nOCcsIFxuICAgICAgICAgICAgICAgIGNvbmZpZy5tZXRhZGF0YVF1ZXJ5UGFyYW1zIHx8IHt9XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBTZXQgbmV3IHN0eWxlIGxheWVyIGFzIGEgYmFzZSBsYXllciBvbiB0aGUgbWFwOlxuICAgICAgICAgICAgbWFwLnNldEJhc2VMYXllcihuZXdTdHlsZUxheWVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIE1hcFByb3h5KCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICByZWZyZXNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjdXJyZW50Qm91bmRzID0gdGhpcy5nZXRWaWV3Qm91bmRzKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRNYXBTaXplcygpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFZpZXdCb3VuZHMoY3VycmVudEJvdW5kcyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXRNYXBTaXplczogZnVuY3Rpb24gKGhlaWdodCwgd2lkdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgX3Jlc2l6ZUhhbmRsZXIuYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGdldFBsYXRmb3JtOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBoZXJlbWFwcztcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGNhbGN1bGF0ZVJvdXRlOiBmdW5jdGlvbiAoZHJpdmVUeXBlLCBkaXJlY3Rpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEhlcmVNYXBzUm91dGVzU2VydmljZS5jYWxjdWxhdGVSb3V0ZShoZXJlbWFwcywge1xuICAgICAgICAgICAgICAgICAgICAgICAgZHJpdmVUeXBlOiBkcml2ZVR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkaXJlY3Rpb246IGRpcmVjdGlvblxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGFkZFJvdXRlVG9NYXA6IGZ1bmN0aW9uIChyb3V0ZURhdGEsIGNsZWFuKSB7XG4gICAgICAgICAgICAgICAgICAgIEhlcmVNYXBzUm91dGVzU2VydmljZS5hZGRSb3V0ZVRvTWFwKGhlcmVtYXBzLm1hcCwgcm91dGVEYXRhLCBjbGVhbik7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXRab29tOiBmdW5jdGlvbiAoem9vbSwgc3RlcCkge1xuICAgICAgICAgICAgICAgICAgICBIZXJlTWFwc1V0aWxzU2VydmljZS56b29tKGhlcmVtYXBzLm1hcCwgem9vbSB8fCAxMCwgc3RlcCk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBnZXRab29tOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBoZXJlbWFwcy5tYXAuZ2V0Wm9vbSgpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgZ2V0Q2VudGVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBoZXJlbWFwcy5tYXAuZ2V0Q2VudGVyKCk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBnZXRWaWV3Qm91bmRzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBoZXJlbWFwcy5tYXAuZ2V0Vmlld0JvdW5kcygpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0Vmlld0JvdW5kczogZnVuY3Rpb24gKGJvdW5kaW5nUmVjdCwgb3B0X2FuaW1hdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLnNldFZpZXdCb3VuZHMoaGVyZW1hcHMubWFwLCBib3VuZGluZ1JlY3QsIG9wdF9hbmltYXRlKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGdldEJvdW5kc1JlY3RGcm9tUG9pbnRzOiBmdW5jdGlvbiAodG9wTGVmdCwgYm90dG9tUmlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmdldEJvdW5kc1JlY3RGcm9tUG9pbnRzLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXRDZW50ZXI6IGZ1bmN0aW9uIChjb29yZHMsIG9wdF9hbmltYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghY29vcmRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gY29uc29sZS5lcnJvcignY29vcmRzIGFyZSBub3Qgc3BlY2lmaWVkIScpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaGVyZW1hcHMubWFwLnNldENlbnRlcihjb29yZHMsIG9wdF9hbmltYXRlKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGNsZWFuUm91dGVzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIEhlcmVNYXBzUm91dGVzU2VydmljZS5jbGVhblJvdXRlcyhoZXJlbWFwcy5tYXApO1xuICAgICAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZUhpZ2hBY2N1cmFjeVxuICAgICAgICAgICAgICAgICAqIEBwYXJhbSB7TnVtYmVyfSBtYXhpbXVtQWdlIC0gdGhlIG1heGltdW0gYWdlIGluIG1pbGxpc2Vjb25kcyBvZiBhIHBvc3NpYmxlIGNhY2hlZCBwb3NpdGlvbiB0aGF0IGlzIGFjY2VwdGFibGUgdG8gcmV0dXJuLiBJZiBzZXQgdG8gMCwgaXQgbWVhbnMgdGhhdCB0aGUgZGV2aWNlIGNhbm5vdCB1c2UgYSBjYWNoZWQgcG9zaXRpb24gYW5kIG11c3QgYXR0ZW1wdCB0byByZXRyaWV2ZSB0aGUgcmVhbCBjdXJyZW50IHBvc2l0aW9uXG4gICAgICAgICAgICAgICAgICogQHJldHVybiB7UHJvbWlzZX1cbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICBnZXRVc2VyTG9jYXRpb246IGZ1bmN0aW9uIChlbmFibGVIaWdoQWNjdXJhY3ksIG1heGltdW1BZ2UpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIF9nZXRMb2NhdGlvbi5hcHBseShudWxsLCBhcmd1bWVudHMpLnRoZW4oZnVuY3Rpb24gKHBvc2l0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY29vcmRzID0gcG9zaXRpb24uY29vcmRzO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhdDogY29vcmRzLmxhdGl0dWRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxuZzogY29vcmRzLmxvbmdpdHVkZVxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGdlb2NvZGVQb3NpdGlvbjogZnVuY3Rpb24gKGNvb3Jkcywgb3B0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSGVyZU1hcHNBUElTZXJ2aWNlLmdlb2NvZGVQb3NpdGlvbihoZXJlbWFwcy5wbGF0Zm9ybSwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29vcmRzOiBjb29yZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICByYWRpdXM6IG9wdGlvbnMgJiYgb3B0aW9ucy5yYWRpdXMsXG4gICAgICAgICAgICAgICAgICAgICAgICBsYW5nOiBvcHRpb25zICYmIG9wdGlvbnMubGFuZ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGdlb2NvZGVBZGRyZXNzOiBmdW5jdGlvbiAoYWRkcmVzcykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSGVyZU1hcHNBUElTZXJ2aWNlLmdlb2NvZGVBZGRyZXNzKGhlcmVtYXBzLnBsYXRmb3JtLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWFyY2h0ZXh0OiBhZGRyZXNzICYmIGFkZHJlc3Muc2VhcmNodGV4dCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvdW50cnk6IGFkZHJlc3MgJiYgYWRkcmVzcy5jb3VudHJ5LFxuICAgICAgICAgICAgICAgICAgICAgICAgY2l0eTogYWRkcmVzcyAmJiBhZGRyZXNzLmNpdHksXG4gICAgICAgICAgICAgICAgICAgICAgICBzdHJlZXQ6IGFkZHJlc3MgJiYgYWRkcmVzcy5zdHJlZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICBob3VzZW51bWJlcjogYWRkcmVzcyAmJiBhZGRyZXNzLmhvdXNlbnVtYmVyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgZ2VvY29kZUF1dG9jb21wbGV0ZTogZnVuY3Rpb24gKHF1ZXJ5LCBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBIZXJlTWFwc0FQSVNlcnZpY2UuZ2VvY29kZUF1dG9jb21wbGV0ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBxdWVyeTogcXVlcnksXG4gICAgICAgICAgICAgICAgICAgICAgICBiZWdpbkhpZ2hsaWdodDogb3B0aW9ucyAmJiBvcHRpb25zLmJlZ2luSGlnaGxpZ2h0LFxuICAgICAgICAgICAgICAgICAgICAgICAgZW5kSGlnaGxpZ2h0OiBvcHRpb25zICYmIG9wdGlvbnMuZW5kSGlnaGxpZ2h0LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWF4cmVzdWx0czogb3B0aW9ucyAmJiBvcHRpb25zLm1heHJlc3VsdHNcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBmaW5kTG9jYXRpb25CeUlkOiBmdW5jdGlvbiAobG9jYXRpb25JZCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSGVyZU1hcHNBUElTZXJ2aWNlLmZpbmRMb2NhdGlvbkJ5SWQobG9jYXRpb25JZCk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB1cGRhdGVNYXJrZXJzOiBmdW5jdGlvbiAocGxhY2VzLCByZWZyZXNoVmlld2JvdW5kcykge1xuICAgICAgICAgICAgICAgICAgICBIZXJlTWFwc01hcmtlclNlcnZpY2UudXBkYXRlTWFya2VycyhoZXJlbWFwcy5tYXAsIHBsYWNlcywgcmVmcmVzaFZpZXdib3VuZHMpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgZ2V0TWFwRmFjdG9yeTogZnVuY3Rpb24gKCl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBIZXJlTWFwc1V0aWxzU2VydmljZS5nZXRNYXBGYWN0b3J5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICB9XG59O1xuIiwicmVxdWlyZSgnLi9wcm92aWRlcnMvbWFya2VycycpO1xucmVxdWlyZSgnLi9wcm92aWRlcnMvbWFwLW1vZHVsZXMnKTtcbnJlcXVpcmUoJy4vcHJvdmlkZXJzL3JvdXRlcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGFuZ3VsYXIubW9kdWxlKCdoZXJlbWFwcycsIFtcbiAgICAnaGVyZW1hcHMtbWFya2Vycy1tb2R1bGUnLFxuICAgICdoZXJlbWFwcy1yb3V0ZXMtbW9kdWxlJyxcbiAgICAnaGVyZW1hcHMtbWFwLW1vZHVsZXMnXG5dKVxuICAgIC5wcm92aWRlcignSGVyZU1hcHNDb25maWcnLCByZXF1aXJlKCcuL3Byb3ZpZGVycy9tYXBjb25maWcucHJvdmlkZXInKSlcbiAgICAuc2VydmljZSgnSGVyZU1hcHNVdGlsc1NlcnZpY2UnLCByZXF1aXJlKCcuL3Byb3ZpZGVycy9tYXB1dGlscy5zZXJ2aWNlJykpXG4gICAgLnNlcnZpY2UoJ0hlcmVNYXBzQVBJU2VydmljZScsIHJlcXVpcmUoJy4vcHJvdmlkZXJzL2FwaS5zZXJ2aWNlJykpXG4gICAgLmNvbnN0YW50KCdIZXJlTWFwc0NPTlNUUycsIHJlcXVpcmUoJy4vcHJvdmlkZXJzL2NvbnN0cycpKVxuICAgIC5kaXJlY3RpdmUoJ2hlcmVtYXBzJywgcmVxdWlyZSgnLi9oZXJlbWFwcy5kaXJlY3RpdmUnKSk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IEhlcmVNYXBzQVBJU2VydmljZTtcblxuSGVyZU1hcHNBUElTZXJ2aWNlLiRpbmplY3QgPSBbXG4gICAgJyRxJyxcbiAgICAnJGh0dHAnLFxuICAgICdIZXJlTWFwc0NvbmZpZycsXG4gICAgJ0hlcmVNYXBzVXRpbHNTZXJ2aWNlJyxcbiAgICAnSGVyZU1hcHNDT05TVFMnXG5dO1xuZnVuY3Rpb24gSGVyZU1hcHNBUElTZXJ2aWNlKCRxLCAkaHR0cCwgSGVyZU1hcHNDb25maWcsIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLCBIZXJlTWFwc0NPTlNUUykge1xuICAgIHZhciB2ZXJzaW9uID0gSGVyZU1hcHNDb25maWcuYXBpVmVyc2lvbixcbiAgICAgICAgcHJvdG9jb2wgPSBIZXJlTWFwc0NvbmZpZy51c2VIVFRQUyA/ICdodHRwcycgOiAnaHR0cCc7XG5cbiAgICB2YXIgQVBJX1ZFUlNJT04gPSB7XG4gICAgICAgIFY6IHBhcnNlSW50KHZlcnNpb24pLFxuICAgICAgICBTVUI6IHZlcnNpb25cbiAgICB9O1xuXG4gICAgdmFyIENPTkZJRyA9IHtcbiAgICAgICAgQkFTRTogXCI6Ly9qcy5hcGkuaGVyZS5jb20vdlwiLFxuICAgICAgICBDT1JFOiBcIm1hcHNqcy1jb3JlLmpzXCIsXG4gICAgICAgIENPUkVMRUdBQ1k6IFwibWFwc2pzLWNvcmUtbGVnYWN5LmpzXCIsXG4gICAgICAgIFNFUlZJQ0U6IFwibWFwc2pzLXNlcnZpY2UuanNcIixcbiAgICAgICAgU0VSVklDRUxFR0FDWTogXCJtYXBzanMtc2VydmljZS1sZWdhY3kuanNcIixcbiAgICAgICAgVUk6IHtcbiAgICAgICAgICAgIHNyYzogXCJtYXBzanMtdWkuanNcIixcbiAgICAgICAgICAgIGhyZWY6IFwibWFwc2pzLXVpLmNzc1wiXG4gICAgICAgIH0sXG4gICAgICAgIEVWRU5UUzogXCJtYXBzanMtbWFwZXZlbnRzLmpzXCIsXG4gICAgICAgIEFVVE9DT01QTEVURV9VUkw6IFwiOi8vYXV0b2NvbXBsZXRlLmdlb2NvZGVyLmNpdC5hcGkuaGVyZS5jb20vNi4yL3N1Z2dlc3QuanNvblwiLFxuICAgICAgICBMT0NBVElPTl9VUkw6IFwiOi8vZ2VvY29kZXIuY2l0LmFwaS5oZXJlLmNvbS82LjIvZ2VvY29kZS5qc29uXCJcbiAgICB9O1xuXG4gICAgdmFyIEFQSV9ERUZFUlNRdWV1ZSA9IHt9O1xuXG4gICAgQVBJX0RFRkVSU1F1ZXVlW0NPTkZJRy5DT1JFXSA9IFtdO1xuICAgIEFQSV9ERUZFUlNRdWV1ZVtDT05GSUcuQ09SRUxFR0FDWV0gPSBbXTtcbiAgICBBUElfREVGRVJTUXVldWVbQ09ORklHLlNFUlZJQ0VdID0gW107XG4gICAgQVBJX0RFRkVSU1F1ZXVlW0NPTkZJRy5TRVJWSUNFTEVHQUNZXSA9IFtdO1xuICAgIEFQSV9ERUZFUlNRdWV1ZVtDT05GSUcuVUkuc3JjXSA9IFtdO1xuICAgIEFQSV9ERUZFUlNRdWV1ZVtDT05GSUcuUEFOT10gPSBbXTtcbiAgICBBUElfREVGRVJTUXVldWVbQ09ORklHLkVWRU5UU10gPSBbXTtcblxuICAgIHZhciBoZWFkID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2hlYWQnKVswXTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGxvYWRBcGk6IGxvYWRBcGksXG4gICAgICAgIGxvYWRNb2R1bGVzOiBsb2FkTW9kdWxlcyxcbiAgICAgICAgZ2V0UG9zaXRpb246IGdldFBvc2l0aW9uLFxuICAgICAgICBnZW9jb2RlUG9zaXRpb246IGdlb2NvZGVQb3NpdGlvbixcbiAgICAgICAgZ2VvY29kZUFkZHJlc3M6IGdlb2NvZGVBZGRyZXNzLFxuICAgICAgICBnZW9jb2RlQXV0b2NvbXBsZXRlOiBnZW9jb2RlQXV0b2NvbXBsZXRlLFxuICAgICAgICBmaW5kTG9jYXRpb25CeUlkOiBmaW5kTG9jYXRpb25CeUlkXG4gICAgfTtcblxuICAgIC8vI3JlZ2lvbiBQVUJMSUNcbiAgICBmdW5jdGlvbiBsb2FkQXBpKCkge1xuICAgICAgICByZXR1cm4gX2dldExvYWRlcihDT05GSUcuQ09SRSlcbiAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gX2dldExvYWRlcihDT05GSUcuQ09SRUxFR0FDWSk7XG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gX2dldExvYWRlcihDT05GSUcuU0VSVklDRSk7XG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gX2dldExvYWRlcihDT05GSUcuU0VSVklDRUxFR0FDWSk7XG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsb2FkTW9kdWxlcyhhdHRycywgaGFuZGxlcnMpIHtcbiAgICAgICAgZm9yICh2YXIga2V5IGluIGhhbmRsZXJzKSB7XG4gICAgICAgICAgICBpZiAoIWhhbmRsZXJzLmhhc093blByb3BlcnR5KGtleSkgfHwgIWF0dHJzW2tleV0pXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIHZhciBsb2FkZXIgPSBfZ2V0TG9hZGVyQnlBdHRyKGtleSk7XG5cbiAgICAgICAgICAgIGxvYWRlcigpXG4gICAgICAgICAgICAgICAgLnRoZW4oaGFuZGxlcnNba2V5XSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRQb3NpdGlvbihvcHRpb25zKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKG9wdGlvbnMgJiYgSGVyZU1hcHNVdGlsc1NlcnZpY2UuaXNWYWxpZENvb3JkcyhvcHRpb25zLmNvb3JkcykpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoeyBjb29yZHM6IG9wdGlvbnMuY29vcmRzIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbmF2aWdhdG9yLmdlb2xvY2F0aW9uLmdldEN1cnJlbnRQb3NpdGlvbihmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9LCBvcHRpb25zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdlb2NvZGVQb3NpdGlvbihwbGF0Zm9ybSwgcGFyYW1zKSB7XG4gICAgICAgIGlmICghcGFyYW1zLmNvb3JkcylcbiAgICAgICAgICAgIHJldHVybiBjb25zb2xlLmVycm9yKCdNaXNzZWQgcmVxdWlyZWQgY29vcmRzJyk7XG5cbiAgICAgICAgdmFyIGdlb2NvZGVyID0gcGxhdGZvcm0uZ2V0R2VvY29kaW5nU2VydmljZSgpLFxuICAgICAgICAgICAgZGVmZXJyZWQgPSAkcS5kZWZlcigpLFxuICAgICAgICAgICAgX3BhcmFtcyA9IHtcbiAgICAgICAgICAgICAgICBwcm94OiBbcGFyYW1zLmNvb3Jkcy5sYXQsIHBhcmFtcy5jb29yZHMubG5nLCBwYXJhbXMucmFkaXVzIHx8IDI1MF0uam9pbignLCcpLFxuICAgICAgICAgICAgICAgIG1vZGU6ICdyZXRyaWV2ZUFkZHJlc3NlcycsXG4gICAgICAgICAgICAgICAgbWF4cmVzdWx0czogJzEnLFxuICAgICAgICAgICAgICAgIGdlbjogJzgnLFxuICAgICAgICAgICAgICAgIGxhbmd1YWdlOiBwYXJhbXMubGFuZyB8fCAnZW4tZ2InXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIGdlb2NvZGVyLnJldmVyc2VHZW9jb2RlKF9wYXJhbXMsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXNwb25zZSlcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2VvY29kZUFkZHJlc3MocGxhdGZvcm0sIHBhcmFtcykge1xuICAgICAgICBpZiAoIXBhcmFtcylcbiAgICAgICAgICAgIHJldHVybiBjb25zb2xlLmVycm9yKCdNaXNzZWQgcmVxdWlyZWQgcGFyYW1ldGVycycpO1xuXG4gICAgICAgIHZhciBnZW9jb2RlciA9IHBsYXRmb3JtLmdldEdlb2NvZGluZ1NlcnZpY2UoKSxcbiAgICAgICAgICAgIGRlZmVycmVkID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICAgIF9wYXJhbXMgPSB7IGdlbjogOCB9O1xuXG4gICAgICAgIGZvciAodmFyIGtleSBpbiBwYXJhbXMpIHsgX3BhcmFtc1trZXldID0gcGFyYW1zW2tleV07IH1cblxuICAgICAgICBnZW9jb2Rlci5nZW9jb2RlKF9wYXJhbXMsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXNwb25zZSlcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdlb2NvZGVBdXRvY29tcGxldGUocGFyYW1zKSB7XG4gICAgICAgIGlmICghcGFyYW1zKVxuICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgcmVxdWlyZWQgcGFyYW1ldGVycycpO1xuXG4gICAgICAgIHZhciBhdXRvY29tcGxldGVVcmwgPSBwcm90b2NvbCArIENPTkZJRy5BVVRPQ09NUExFVEVfVVJMLFxuICAgICAgICAgICAgZGVmZXJyZWQgPSAkcS5kZWZlcigpLFxuICAgICAgICAgICAgX3BhcmFtcyA9IHtcbiAgICAgICAgICAgICAgICBxdWVyeTogXCJcIixcbiAgICAgICAgICAgICAgICBiZWdpbkhpZ2hsaWdodDogXCI8bWFyaz5cIixcbiAgICAgICAgICAgICAgICBlbmRIaWdobGlnaHQ6IFwiPC9tYXJrPlwiLFxuICAgICAgICAgICAgICAgIG1heHJlc3VsdHM6IFwiNVwiXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIGZvciAodmFyIGtleSBpbiBfcGFyYW1zKSB7XG4gICAgICAgICAgICBpZiAoYW5ndWxhci5pc0RlZmluZWQocGFyYW1zW2tleV0pKSB7XG4gICAgICAgICAgICAgICAgX3BhcmFtc1trZXldID0gcGFyYW1zW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBfcGFyYW1zLmFwcF9pZCA9IEhlcmVNYXBzQ29uZmlnLmFwcF9pZDtcbiAgICAgICAgX3BhcmFtcy5hcHBfY29kZSA9IEhlcmVNYXBzQ29uZmlnLmFwcF9jb2RlO1xuICAgICAgICBfcGFyYW1zLmFwaUtleSA9IEhlcmVNYXBzQ29uZmlnLmFwaUtleTtcblxuICAgICAgICAkaHR0cC5nZXQoYXV0b2NvbXBsZXRlVXJsLCB7IHBhcmFtczogX3BhcmFtcyB9KVxuICAgICAgICAgICAgLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuZXJyb3IoZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmluZHMgbG9jYXRpb24gYnkgSEVSRSBNYXBzIExvY2F0aW9uIGlkZW50aWZpZXIuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZmluZExvY2F0aW9uQnlJZChsb2NhdGlvbklkKSB7XG4gICAgICAgIGlmICghbG9jYXRpb25JZClcbiAgICAgICAgICAgIHJldHVybiBjb25zb2xlLmVycm9yKCdNaXNzaW5nIExvY2F0aW9uIElkZW50aWZpZXInKTtcblxuICAgICAgICB2YXIgbG9jYXRpb25VcmwgPSBwcm90b2NvbCArIENPTkZJRy5MT0NBVElPTl9VUkwsXG4gICAgICAgICAgICBkZWZlcnJlZCA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgICBfcGFyYW1zID0ge1xuICAgICAgICAgICAgICAgIGxvY2F0aW9uaWQ6IGxvY2F0aW9uSWQsXG4gICAgICAgICAgICAgICAgZ2VuOiA5LFxuICAgICAgICAgICAgICAgIGFwcF9pZDogSGVyZU1hcHNDb25maWcuYXBwX2lkLFxuICAgICAgICAgICAgICAgIGFwcF9jb2RlOiBIZXJlTWFwc0NvbmZpZy5hcHBfY29kZSxcbiAgICAgICAgICAgICAgICBhcGlLZXk6IEhlcmVNYXBzQ29uZmlnLmFwaUtleVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAkaHR0cC5nZXQobG9jYXRpb25VcmwsIHsgcGFyYW1zOiBfcGFyYW1zIH0pXG4gICAgICAgICAgICAuc3VjY2VzcyhmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5lcnJvcihmdW5jdGlvbihlcnJvcikge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG5cbiAgICAvLyNlbmRyZWdpb24gUFVCTElDXG5cbiAgICBmdW5jdGlvbiBfZ2V0TG9hZGVyQnlBdHRyKGF0dHIpIHtcbiAgICAgICAgdmFyIGxvYWRlcjtcblxuICAgICAgICBzd2l0Y2ggKGF0dHIpIHtcbiAgICAgICAgICAgIGNhc2UgSGVyZU1hcHNDT05TVFMuTU9EVUxFUy5VSTpcbiAgICAgICAgICAgICAgICBsb2FkZXIgPSBfbG9hZFVJTW9kdWxlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBIZXJlTWFwc0NPTlNUUy5NT0RVTEVTLkVWRU5UUzpcbiAgICAgICAgICAgICAgICBsb2FkZXIgPSBfbG9hZEV2ZW50c01vZHVsZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIG1vZHVsZScsIGF0dHIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxvYWRlcjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfbG9hZFVJTW9kdWxlKCkge1xuICAgICAgICBpZiAoIV9pc0xvYWRlZChDT05GSUcuVUkuc3JjKSkge1xuICAgICAgICAgICAgdmFyIGxpbmsgPSBIZXJlTWFwc1V0aWxzU2VydmljZS5jcmVhdGVMaW5rVGFnKHtcbiAgICAgICAgICAgICAgICByZWw6ICdzdHlsZXNoZWV0JyxcbiAgICAgICAgICAgICAgICB0eXBlOiAndGV4dC9jc3MnLFxuICAgICAgICAgICAgICAgIGhyZWY6IF9nZXRVUkwoQ09ORklHLlVJLmhyZWYpXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbGluayAmJiBoZWFkLmFwcGVuZENoaWxkKGxpbmspO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIF9nZXRMb2FkZXIoQ09ORklHLlVJLnNyYyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2xvYWRFdmVudHNNb2R1bGUoKSB7XG4gICAgICAgIHJldHVybiBfZ2V0TG9hZGVyKENPTkZJRy5FVkVOVFMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzb3VyY2VOYW1lXG4gICAgICogcmV0dXJuIHtTdHJpbmd9IGUuZyBodHRwOi8vanMuYXBpLmhlcmUuY29tL3Z7VkVSfS97U1VCVkVSU0lPTn0ve1NPVVJDRX1cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBfZ2V0VVJMKHNvdXJjZU5hbWUpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIHByb3RvY29sLFxuICAgICAgICAgICAgQ09ORklHLkJBU0UsXG4gICAgICAgICAgICBBUElfVkVSU0lPTi5WLFxuICAgICAgICAgICAgXCIvXCIsXG4gICAgICAgICAgICBBUElfVkVSU0lPTi5TVUIsXG4gICAgICAgICAgICBcIi9cIixcbiAgICAgICAgICAgIHNvdXJjZU5hbWVcbiAgICAgICAgXS5qb2luKFwiXCIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9nZXRMb2FkZXIoc291cmNlTmFtZSkge1xuICAgICAgICB2YXIgZGVmZXIgPSAkcS5kZWZlcigpLCBzcmMsIHNjcmlwdDtcblxuICAgICAgICBpZiAoX2lzTG9hZGVkKHNvdXJjZU5hbWUpKSB7XG4gICAgICAgICAgICBkZWZlci5yZXNvbHZlKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzcmMgPSBfZ2V0VVJMKHNvdXJjZU5hbWUpO1xuICAgICAgICAgICAgc2NyaXB0ID0gSGVyZU1hcHNVdGlsc1NlcnZpY2UuY3JlYXRlU2NyaXB0VGFnKHsgc3JjOiBzcmMgfSk7XG5cbiAgICAgICAgICAgIHNjcmlwdCAmJiBoZWFkLmFwcGVuZENoaWxkKHNjcmlwdCk7XG5cbiAgICAgICAgICAgIEFQSV9ERUZFUlNRdWV1ZVtzb3VyY2VOYW1lXS5wdXNoKGRlZmVyKTtcblxuICAgICAgICAgICAgc2NyaXB0Lm9ubG9hZCA9IF9vbkxvYWQuYmluZChudWxsLCBzb3VyY2VOYW1lKTtcbiAgICAgICAgICAgIHNjcmlwdC5vbmVycm9yID0gX29uRXJyb3IuYmluZChudWxsLCBzb3VyY2VOYW1lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9pc0xvYWRlZChzb3VyY2VOYW1lKSB7XG4gICAgICAgIHZhciBjaGVja2VyID0gbnVsbDtcblxuICAgICAgICBzd2l0Y2ggKHNvdXJjZU5hbWUpIHtcbiAgICAgICAgICAgIGNhc2UgQ09ORklHLkNPUkU6XG4gICAgICAgICAgICAgICAgY2hlY2tlciA9IF9pc0NvcmVMb2FkZWQ7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIENPTkZJRy5TRVJWSUNFOlxuICAgICAgICAgICAgICAgIGNoZWNrZXIgPSBfaXNTZXJ2aWNlTG9hZGVkO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBDT05GSUcuVUkuc3JjOlxuICAgICAgICAgICAgICAgIGNoZWNrZXIgPSBfaXNVSUxvYWRlZDtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgQ09ORklHLkVWRU5UUzpcbiAgICAgICAgICAgICAgICBjaGVja2VyID0gX2lzRXZlbnRzTG9hZGVkO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBjaGVja2VyID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gZmFsc2UgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjaGVja2VyKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2lzQ29yZUxvYWRlZCgpIHtcbiAgICAgICAgcmV0dXJuICEhd2luZG93Lkg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2lzU2VydmljZUxvYWRlZCgpIHtcbiAgICAgICAgcmV0dXJuICEhKHdpbmRvdy5IICYmIHdpbmRvdy5ILnNlcnZpY2UpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9pc1VJTG9hZGVkKCkge1xuICAgICAgICByZXR1cm4gISEod2luZG93LkggJiYgd2luZG93LkgudWkpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9pc0V2ZW50c0xvYWRlZCgpIHtcbiAgICAgICAgcmV0dXJuICEhKHdpbmRvdy5IICYmIHdpbmRvdy5ILm1hcGV2ZW50cyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX29uTG9hZChzb3VyY2VOYW1lKSB7XG4gICAgICAgIHZhciBkZWZlclF1ZXVlID0gQVBJX0RFRkVSU1F1ZXVlW3NvdXJjZU5hbWVdO1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgbCA9IGRlZmVyUXVldWUubGVuZ3RoOyBpIDwgbDsgKytpKSB7XG4gICAgICAgICAgICB2YXIgZGVmZXIgPSBkZWZlclF1ZXVlW2ldO1xuICAgICAgICAgICAgZGVmZXIucmVzb2x2ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgQVBJX0RFRkVSU1F1ZXVlW3NvdXJjZU5hbWVdID0gW107XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX29uRXJyb3Ioc291cmNlTmFtZSkge1xuICAgICAgICB2YXIgZGVmZXJRdWV1ZSA9IEFQSV9ERUZFUlNRdWV1ZVtzb3VyY2VOYW1lXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBkZWZlclF1ZXVlLmxlbmd0aDsgaSA8IGw7ICsraSkge1xuICAgICAgICAgICAgdmFyIGRlZmVyID0gZGVmZXJRdWV1ZVtpXTtcbiAgICAgICAgICAgIGRlZmVyLnJlamVjdCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgQVBJX0RFRkVSU1F1ZXVlW3NvdXJjZU5hbWVdID0gW107XG4gICAgfVxufTtcbiIsIm1vZHVsZS5leHBvcnRzID0ge1xuICAgIFVQREFURV9NQVBfUkVTSVpFX1RJTUVPVVQ6IDUwMCxcbiAgICBBTklNQVRJT05fWk9PTV9TVEVQOiAuMDUsXG4gICAgTU9EVUxFUzoge1xuICAgICAgICBVSTogJ2NvbnRyb2xzJyxcbiAgICAgICAgRVZFTlRTOiAnZXZlbnRzJyxcbiAgICAgICAgUEFOTzogJ3Bhbm8nXG4gICAgfSxcbiAgICBERUZBVUxUX01BUF9PUFRJT05TOiB7XG4gICAgICAgIGhlaWdodDogNDgwLFxuICAgICAgICB3aWR0aDogNjQwLFxuICAgICAgICB6b29tOiAxMixcbiAgICAgICAgbWF4Wm9vbTogMixcbiAgICAgICAgcmVzaXplOiBmYWxzZSxcbiAgICAgICAgZHJhZ2dhYmxlOiBmYWxzZSxcbiAgICAgICAgY29vcmRzOiB7XG4gICAgICAgICAgICBsb25naXR1ZGU6IDAsXG4gICAgICAgICAgICBsYXRpdHVkZTogMFxuICAgICAgICB9XG4gICAgfSxcbiAgICBNQVJLRVJfVFlQRVM6IHtcbiAgICAgICAgRE9NOiBcIkRPTVwiLFxuICAgICAgICBTVkc6IFwiU1ZHXCJcbiAgICB9LFxuICAgIENPTlRST0xTOiB7XG4gICAgICAgIE5BTUVTOiB7XG4gICAgICAgICAgICBTQ0FMRTogJ3NjYWxlYmFyJyxcbiAgICAgICAgICAgIFNFVFRJTkdTOiAnbWFwc2V0dGluZ3MnLFxuICAgICAgICAgICAgWk9PTTogJ3pvb20nLFxuICAgICAgICAgICAgVVNFUjogJ3VzZXJwb3NpdGlvbidcbiAgICAgICAgfSxcbiAgICAgICAgUE9TSVRJT05TOiBbXG4gICAgICAgICAgICAndG9wLXJpZ2h0JyxcbiAgICAgICAgICAgICd0b3AtY2VudGVyJyxcbiAgICAgICAgICAgICd0b3AtbGVmdCcsXG4gICAgICAgICAgICAnbGVmdC10b3AnLFxuICAgICAgICAgICAgJ2xlZnQtbWlkZGxlJyxcbiAgICAgICAgICAgICdsZWZ0LWJvdHRvbScsXG4gICAgICAgICAgICAncmlnaHQtdG9wJyxcbiAgICAgICAgICAgICdyaWdodC1taWRkbGUnLFxuICAgICAgICAgICAgJ3JpZ2h0LWJvdHRvbScsXG4gICAgICAgICAgICAnYm90dG9tLXJpZ2h0JyxcbiAgICAgICAgICAgICdib3R0b20tY2VudGVyJyxcbiAgICAgICAgICAgICdib3R0b20tbGVmdCdcbiAgICAgICAgXVxuICAgIH0sXG4gICAgSU5GT0JVQkJMRToge1xuICAgICAgICBTVEFURToge1xuICAgICAgICAgICAgT1BFTjogJ29wZW4nLFxuICAgICAgICAgICAgQ0xPU0VEOiAnY2xvc2VkJ1xuICAgICAgICB9LFxuICAgICAgICBESVNQTEFZX0VWRU5UOiB7XG4gICAgICAgICAgICBwb2ludGVybW92ZTogJ29uSG92ZXInLFxuICAgICAgICAgICAgdGFwOiAnb25DbGljaydcbiAgICAgICAgfVxuICAgIH0sXG4gICAgVVNFUl9FVkVOVFM6IHtcbiAgICAgICAgdGFwOiAnY2xpY2snLFxuICAgICAgICBwb2ludGVybW92ZTogJ21vdXNlbW92ZScsXG4gICAgICAgIHBvaW50ZXJsZWF2ZTogJ21vdXNlbGVhdmUnLFxuICAgICAgICBwb2ludGVyZW50ZXI6ICdtb3VzZWVudGVyJyxcbiAgICAgICAgZHJhZzogJ2RyYWcnLFxuICAgICAgICBkcmFnc3RhcnQ6ICdkcmFnc3RhcnQnLFxuICAgICAgICBkcmFnZW5kOiAnZHJhZ2VuZCcsXG4gICAgICAgIG1hcHZpZXdjaGFuZ2U6ICdtYXB2aWV3Y2hhbmdlJyxcbiAgICAgICAgbWFwdmlld2NoYW5nZXN0YXJ0OiAnbWFwdmlld2NoYW5nZXN0YXJ0JyxcbiAgICAgICAgbWFwdmlld2NoYW5nZWVuZDogJ21hcHZpZXdjaGFuZ2VlbmQnXG4gICAgfVxufSIsIm1vZHVsZS5leHBvcnRzID0gSGVyZU1hcHNFdmVudHNGYWN0b3J5O1xuXG5IZXJlTWFwc0V2ZW50c0ZhY3RvcnkuJGluamVjdCA9IFtcbiAgICAnSGVyZU1hcHNVdGlsc1NlcnZpY2UnLFxuICAgICdIZXJlTWFwc01hcmtlclNlcnZpY2UnLFxuICAgICdIZXJlTWFwc0NPTlNUUycsXG4gICAgJ0hlcmVNYXBzSW5mb0J1YmJsZUZhY3RvcnknXG5dO1xuZnVuY3Rpb24gSGVyZU1hcHNFdmVudHNGYWN0b3J5KEhlcmVNYXBzVXRpbHNTZXJ2aWNlLCBIZXJlTWFwc01hcmtlclNlcnZpY2UsIEhlcmVNYXBzQ09OU1RTLCBIZXJlTWFwc0luZm9CdWJibGVGYWN0b3J5KSB7XG4gICAgZnVuY3Rpb24gRXZlbnRzKHBsYXRmb3JtLCBJbmplY3RvciwgbGlzdGVuZXJzKSB7XG4gICAgICAgIHRoaXMubWFwID0gcGxhdGZvcm0ubWFwO1xuICAgICAgICB0aGlzLmxpc3RlbmVycyA9IGxpc3RlbmVycztcbiAgICAgICAgdGhpcy5pbmplY3QgPSBuZXcgSW5qZWN0b3IoKTtcbiAgICAgICAgdGhpcy5ldmVudHMgPSBwbGF0Zm9ybS5ldmVudHMgPSBuZXcgSC5tYXBldmVudHMuTWFwRXZlbnRzKHRoaXMubWFwKTtcbiAgICAgICAgdGhpcy5iZWhhdmlvciA9IHBsYXRmb3JtLmJlaGF2aW9yID0gbmV3IEgubWFwZXZlbnRzLkJlaGF2aW9yKHRoaXMuZXZlbnRzKTtcbiAgICAgICAgdGhpcy5idWJibGUgPSBIZXJlTWFwc0luZm9CdWJibGVGYWN0b3J5LmNyZWF0ZSgpO1xuXG4gICAgICAgIHRoaXMuc2V0dXBFdmVudExpc3RlbmVycygpO1xuICAgIH1cblxuICAgIHZhciBwcm90byA9IEV2ZW50cy5wcm90b3R5cGU7XG5cbiAgICBwcm90by5zZXR1cEV2ZW50TGlzdGVuZXJzID0gc2V0dXBFdmVudExpc3RlbmVycztcbiAgICBwcm90by5zZXR1cE9wdGlvbnMgPSBzZXR1cE9wdGlvbnM7XG4gICAgcHJvdG8udHJpZ2dlclVzZXJMaXN0ZW5lciA9IHRyaWdnZXJVc2VyTGlzdGVuZXI7XG4gICAgcHJvdG8uaW5mb0J1YmJsZUhhbmRsZXIgPSBpbmZvQnViYmxlSGFuZGxlcjsgIFxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgc3RhcnQ6IGZ1bmN0aW9uKGFyZ3MpIHtcbiAgICAgICAgICAgIGlmICghKGFyZ3MucGxhdGZvcm0ubWFwIGluc3RhbmNlb2YgSC5NYXApKVxuICAgICAgICAgICAgICAgIHJldHVybiBjb25zb2xlLmVycm9yKCdNaXNzZWQgcmVxdWlyZWQgbWFwIGluc3RhbmNlJyk7XG5cbiAgICAgICAgICAgIHZhciBldmVudHMgPSBuZXcgRXZlbnRzKGFyZ3MucGxhdGZvcm0sIGFyZ3MuaW5qZWN0b3IsIGFyZ3MubGlzdGVuZXJzKTtcblxuICAgICAgICAgICAgYXJncy5vcHRpb25zICYmIGV2ZW50cy5zZXR1cE9wdGlvbnMoYXJncy5vcHRpb25zKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldHVwRXZlbnRMaXN0ZW5lcnMoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICBIZXJlTWFwc1V0aWxzU2VydmljZS5hZGRFdmVudExpc3RlbmVyKHRoaXMubWFwLCAndGFwJywgdGhpcy5pbmZvQnViYmxlSGFuZGxlci5iaW5kKHRoaXMpKTtcblxuICAgICAgICBIZXJlTWFwc1V0aWxzU2VydmljZS5hZGRFdmVudExpc3RlbmVyKHRoaXMubWFwLCAncG9pbnRlcm1vdmUnLCB0aGlzLmluZm9CdWJibGVIYW5kbGVyLmJpbmQodGhpcykpO1xuXG4gICAgICAgIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5tYXAsICdkcmFnc3RhcnQnLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBpZiAoSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLmlzTWFya2VySW5zdGFuY2UoZS50YXJnZXQpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5iZWhhdmlvci5kaXNhYmxlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNlbGYudHJpZ2dlclVzZXJMaXN0ZW5lcihIZXJlTWFwc0NPTlNUUy5VU0VSX0VWRU5UU1tlLnR5cGVdLCBlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgSGVyZU1hcHNVdGlsc1NlcnZpY2UuYWRkRXZlbnRMaXN0ZW5lcih0aGlzLm1hcCwgJ2RyYWcnLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICB2YXIgcG9pbnRlciA9IGUuY3VycmVudFBvaW50ZXIsXG4gICAgICAgICAgICAgICAgdGFyZ2V0ID0gZS50YXJnZXQ7XG5cbiAgICAgICAgICAgIGlmIChIZXJlTWFwc01hcmtlclNlcnZpY2UuaXNNYXJrZXJJbnN0YW5jZSh0YXJnZXQpKSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0LnNldFBvc2l0aW9uKHNlbGYubWFwLnNjcmVlblRvR2VvKHBvaW50ZXIudmlld3BvcnRYLCBwb2ludGVyLnZpZXdwb3J0WSkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzZWxmLnRyaWdnZXJVc2VyTGlzdGVuZXIoSGVyZU1hcHNDT05TVFMuVVNFUl9FVkVOVFNbZS50eXBlXSwgZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5tYXAsICdkcmFnZW5kJywgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKEhlcmVNYXBzTWFya2VyU2VydmljZS5pc01hcmtlckluc3RhbmNlKGUudGFyZ2V0KSkge1xuICAgICAgICAgICAgICAgIHNlbGYuYmVoYXZpb3IuZW5hYmxlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNlbGYudHJpZ2dlclVzZXJMaXN0ZW5lcihIZXJlTWFwc0NPTlNUUy5VU0VSX0VWRU5UU1tlLnR5cGVdLCBlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgSGVyZU1hcHNVdGlsc1NlcnZpY2UuYWRkRXZlbnRMaXN0ZW5lcih0aGlzLm1hcCwgJ21hcHZpZXdjaGFuZ2VzdGFydCcsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHNlbGYudHJpZ2dlclVzZXJMaXN0ZW5lcihIZXJlTWFwc0NPTlNUUy5VU0VSX0VWRU5UU1tlLnR5cGVdLCBlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgSGVyZU1hcHNVdGlsc1NlcnZpY2UuYWRkRXZlbnRMaXN0ZW5lcih0aGlzLm1hcCwgJ21hcHZpZXdjaGFuZ2UnLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBzZWxmLnRyaWdnZXJVc2VyTGlzdGVuZXIoSGVyZU1hcHNDT05TVFMuVVNFUl9FVkVOVFNbZS50eXBlXSwgZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5tYXAsICdtYXB2aWV3Y2hhbmdlZW5kJywgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgc2VsZi50cmlnZ2VyVXNlckxpc3RlbmVyKEhlcmVNYXBzQ09OU1RTLlVTRVJfRVZFTlRTW2UudHlwZV0sIGUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXR1cE9wdGlvbnMob3B0aW9ucykge1xuICAgICAgICBpZiAoIW9wdGlvbnMpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy5tYXAuZHJhZ2dhYmxlID0gISFvcHRpb25zLmRyYWdnYWJsZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0cmlnZ2VyVXNlckxpc3RlbmVyKGV2ZW50TmFtZSwgZSkge1xuICAgICAgICBpZiAoIXRoaXMubGlzdGVuZXJzKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBjYWxsYmFjayA9IHRoaXMubGlzdGVuZXJzW2V2ZW50TmFtZV07XG5cbiAgICAgICAgY2FsbGJhY2sgJiYgY2FsbGJhY2soZSk7XG4gICAgfVxuICAgIFxuICAgIGZ1bmN0aW9uIGluZm9CdWJibGVIYW5kbGVyKGUpe1xuICAgICAgICB2YXIgdWkgPSB0aGlzLmluamVjdCgndWknKTtcbiAgICAgICAgXG4gICAgICAgIGlmKHVpKVxuICAgICAgICAgICAgdGhpcy5idWJibGUudG9nZ2xlKGUsIHVpKTtcbiAgICAgICAgICAgIFxuICAgICAgICB0aGlzLnRyaWdnZXJVc2VyTGlzdGVuZXIoSGVyZU1hcHNDT05TVFMuVVNFUl9FVkVOVFNbZS50eXBlXSwgZSk7ICAgICAgXG4gICAgfVxuXG59OyIsIm1vZHVsZS5leHBvcnRzID0gSGVyZU1hcHNJbmZvQnViYmxlRmFjdG9yeTtcblxuSGVyZU1hcHNJbmZvQnViYmxlRmFjdG9yeS4kaW5qZWN0ID0gW1xuICAgICdIZXJlTWFwc01hcmtlclNlcnZpY2UnLFxuICAgICdIZXJlTWFwc1V0aWxzU2VydmljZScsXG4gICAgJ0hlcmVNYXBzQ09OU1RTJ1xuXTtcbmZ1bmN0aW9uIEhlcmVNYXBzSW5mb0J1YmJsZUZhY3RvcnkoSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLCBIZXJlTWFwc1V0aWxzU2VydmljZSwgSGVyZU1hcHNDT05TVFMpIHtcbiAgICBmdW5jdGlvbiBJbmZvQnViYmxlKCkge31cblxuICAgIHZhciBwcm90byA9IEluZm9CdWJibGUucHJvdG90eXBlO1xuICAgICAgICBcbiAgICBwcm90by5jcmVhdGUgPSBjcmVhdGU7XG4gICAgcHJvdG8udXBkYXRlID0gdXBkYXRlO1xuICAgIHByb3RvLnRvZ2dsZSA9IHRvZ2dsZTtcbiAgICBwcm90by5zaG93ID0gc2hvdztcbiAgICBwcm90by5jbG9zZSA9IGNsb3NlO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgY3JlYXRlOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBJbmZvQnViYmxlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0b2dnbGUoZSwgdWkpIHtcbiAgICAgICAgaWYgKEhlcmVNYXBzTWFya2VyU2VydmljZS5pc01hcmtlckluc3RhbmNlKGUudGFyZ2V0KSlcbiAgICAgICAgICAgIHRoaXMuc2hvdyhlLCB1aSk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuY2xvc2UoZSwgdWkpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZShidWJibGUsIGRhdGEpIHtcbiAgICAgICAgYnViYmxlLmRpc3BsYXkgPSBkYXRhLmRpc3BsYXk7XG5cbiAgICAgICAgYnViYmxlLnNldFBvc2l0aW9uKGRhdGEucG9zaXRpb24pO1xuICAgICAgICBidWJibGUuc2V0Q29udGVudChkYXRhLm1hcmt1cCk7XG5cbiAgICAgICAgYnViYmxlLnNldFN0YXRlKEhlcmVNYXBzQ09OU1RTLklORk9CVUJCTEUuU1RBVEUuT1BFTik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlKHNvdXJjZSkge1xuICAgICAgICB2YXIgYnViYmxlID0gbmV3IEgudWkuSW5mb0J1YmJsZShzb3VyY2UucG9zaXRpb24sIHtcbiAgICAgICAgICAgIGNvbnRlbnQ6IHNvdXJjZS5tYXJrdXBcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYnViYmxlLmRpc3BsYXkgPSBzb3VyY2UuZGlzcGxheTtcbiAgICAgICAgYnViYmxlLmFkZENsYXNzKEhlcmVNYXBzQ09OU1RTLklORk9CVUJCTEUuU1RBVEUuT1BFTilcblxuICAgICAgICBIZXJlTWFwc1V0aWxzU2VydmljZS5hZGRFdmVudExpc3RlbmVyKGJ1YmJsZSwgJ3N0YXRlY2hhbmdlJywgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgdmFyIHN0YXRlID0gdGhpcy5nZXRTdGF0ZSgpLFxuICAgICAgICAgICAgICAgIGVsID0gdGhpcy5nZXRFbGVtZW50KCk7XG4gICAgICAgICAgICBpZiAoc3RhdGUgPT09IEhlcmVNYXBzQ09OU1RTLklORk9CVUJCTEUuU1RBVEUuQ0xPU0VEKSB7XG4gICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZShIZXJlTWFwc0NPTlNUUy5JTkZPQlVCQkxFLlNUQVRFLk9QRU4pO1xuICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy5hZGRDbGFzcyhzdGF0ZSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGJ1YmJsZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzaG93KGUsIHVpLCBkYXRhKSB7XG4gICAgICAgIHZhciB0YXJnZXQgPSBlLnRhcmdldCxcbiAgICAgICAgICAgIGRhdGEgPSB0YXJnZXQuZ2V0RGF0YSgpLFxuICAgICAgICAgICAgZWwgPSBudWxsO1xuXG4gICAgICAgIGlmICghZGF0YSB8fCAhZGF0YS5kaXNwbGF5IHx8ICFkYXRhLm1hcmt1cCB8fCBkYXRhLmRpc3BsYXkgIT09IEhlcmVNYXBzQ09OU1RTLklORk9CVUJCTEUuRElTUExBWV9FVkVOVFtlLnR5cGVdKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBzb3VyY2UgPSB7XG4gICAgICAgICAgICBwb3NpdGlvbjogdGFyZ2V0LmdldFBvc2l0aW9uKCksXG4gICAgICAgICAgICBtYXJrdXA6IGRhdGEubWFya3VwLFxuICAgICAgICAgICAgZGlzcGxheTogZGF0YS5kaXNwbGF5XG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKCF1aS5idWJibGUpIHtcbiAgICAgICAgICAgIHVpLmJ1YmJsZSA9IHRoaXMuY3JlYXRlKHNvdXJjZSk7XG4gICAgICAgICAgICB1aS5hZGRCdWJibGUodWkuYnViYmxlKTtcblxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy51cGRhdGUodWkuYnViYmxlLCBzb3VyY2UpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsb3NlKGUsIHVpKSB7XG4gICAgICAgIGlmICghdWkuYnViYmxlIHx8IHVpLmJ1YmJsZS5kaXNwbGF5ICE9PSBIZXJlTWFwc0NPTlNUUy5JTkZPQlVCQkxFLkRJU1BMQVlfRVZFTlRbZS50eXBlXSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdWkuYnViYmxlLnNldFN0YXRlKEhlcmVNYXBzQ09OU1RTLklORk9CVUJCTEUuU1RBVEUuQ0xPU0VEKTtcbiAgICB9XG59IiwiYW5ndWxhci5tb2R1bGUoJ2hlcmVtYXBzLWV2ZW50cy1tb2R1bGUnLCBbXSlcbiAgICAuZmFjdG9yeSgnSGVyZU1hcHNFdmVudHNGYWN0b3J5JywgcmVxdWlyZSgnLi9ldmVudHMvZXZlbnRzLmpzJykpXG4gICAgLmZhY3RvcnkoJ0hlcmVNYXBzSW5mb0J1YmJsZUZhY3RvcnknLCByZXF1aXJlKCcuL2V2ZW50cy9pbmZvYnViYmxlLmpzJykpO1xuICAgIFxuYW5ndWxhci5tb2R1bGUoJ2hlcmVtYXBzLXVpLW1vZHVsZScsIFtdKVxuICAgIC5mYWN0b3J5KCdIZXJlTWFwc1VpRmFjdG9yeScsIHJlcXVpcmUoJy4vdWkvdWkuanMnKSlcblxubW9kdWxlLmV4cG9ydHMgPSBhbmd1bGFyLm1vZHVsZSgnaGVyZW1hcHMtbWFwLW1vZHVsZXMnLCBbXG5cdCdoZXJlbWFwcy1ldmVudHMtbW9kdWxlJyxcbiAgICAnaGVyZW1hcHMtdWktbW9kdWxlJ1xuXSk7IiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc1VpRmFjdG9yeTtcblxuSGVyZU1hcHNVaUZhY3RvcnkuJGluamVjdCA9IFtcbiAgICAnSGVyZU1hcHNBUElTZXJ2aWNlJyxcbiAgICAnSGVyZU1hcHNNYXJrZXJTZXJ2aWNlJyxcbiAgICAnSGVyZU1hcHNVdGlsc1NlcnZpY2UnLFxuICAgICdIZXJlTWFwc0NPTlNUUydcbl07XG5mdW5jdGlvbiBIZXJlTWFwc1VpRmFjdG9yeShIZXJlTWFwc0FQSVNlcnZpY2UsIEhlcmVNYXBzTWFya2VyU2VydmljZSwgSGVyZU1hcHNVdGlsc1NlcnZpY2UsIEhlcmVNYXBzQ09OU1RTKSB7XG4gICAgZnVuY3Rpb24gVUkocGxhdGZvcm0sIGFsaWdubWVudCkge1xuICAgICAgICB0aGlzLm1hcCA9IHBsYXRmb3JtLm1hcDtcbiAgICAgICAgdGhpcy5sYXllcnMgPSBwbGF0Zm9ybS5sYXllcnM7XG4gICAgICAgIHRoaXMuYWxpZ25tZW50ID0gYWxpZ25tZW50O1xuICAgICAgICB0aGlzLnVpID0gcGxhdGZvcm0udWkgPSBILnVpLlVJLmNyZWF0ZURlZmF1bHQodGhpcy5tYXAsIHRoaXMubGF5ZXJzKTtcblxuICAgICAgICB0aGlzLnNldHVwQ29udHJvbHMoKTtcbiAgICB9XG5cbiAgICBVSS5pc1ZhbGlkQWxpZ25tZW50ID0gaXNWYWxpZEFsaWdubWVudDtcblxuICAgIHZhciBwcm90byA9IFVJLnByb3RvdHlwZTtcblxuICAgIHByb3RvLnNldHVwQ29udHJvbHMgPSBzZXR1cENvbnRyb2xzO1xuICAgIHByb3RvLmNyZWF0ZVVzZXJDb250cm9sID0gY3JlYXRlVXNlckNvbnRyb2w7XG4gICAgcHJvdG8uc2V0Q29udHJvbHNBbGlnbm1lbnQgPSBzZXRDb250cm9sc0FsaWdubWVudDtcblxuICAgIHJldHVybiB7XG4gICAgICAgIHN0YXJ0OiBmdW5jdGlvbihhcmdzKSB7XG4gICAgICAgICAgICBpZiAoIShhcmdzLnBsYXRmb3JtLm1hcCBpbnN0YW5jZW9mIEguTWFwKSAmJiAhKGFyZ3MucGxhdGZvcm0ubGF5ZXJzKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gY29uc29sZS5lcnJvcignTWlzc2VkIHVpIG1vZHVsZSBkZXBlbmRlbmNpZXMnKTtcblxuICAgICAgICAgICAgdmFyIHVpID0gbmV3IFVJKGFyZ3MucGxhdGZvcm0sIGFyZ3MuYWxpZ25tZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldHVwQ29udHJvbHMoKSB7XG4gICAgICAgIHZhciBOQU1FUyA9IEhlcmVNYXBzQ09OU1RTLkNPTlRST0xTLk5BTUVTLFxuICAgICAgICAgICAgdXNlckNvbnRyb2wgPSB0aGlzLmNyZWF0ZVVzZXJDb250cm9sKCk7XG5cbiAgICAgICAgdGhpcy51aS5nZXRDb250cm9sKE5BTUVTLlNFVFRJTkdTKS5zZXRJbmNpZGVudHNMYXllcihmYWxzZSk7XG4gICAgICAgIHRoaXMudWkuYWRkQ29udHJvbChOQU1FUy5VU0VSLCB1c2VyQ29udHJvbCk7XG4gICAgICAgIHRoaXMuc2V0Q29udHJvbHNBbGlnbm1lbnQoTkFNRVMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZVVzZXJDb250cm9sKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXMsXG4gICAgICAgICAgICB1c2VyQ29udHJvbCA9IG5ldyBILnVpLkNvbnRyb2woKSxcbiAgICAgICAgICAgIG1hcmt1cCA9ICc8c3ZnIGNsYXNzPVwiSF9pY29uXCIgZmlsbD1cIiNmZmZcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAxNiAxNlwiPjxwYXRoIGNsYXNzPVwibWlkZGxlX2xvY2F0aW9uX3N0cm9rZVwiIGQ9XCJNOCAxMmMtMi4yMDYgMC00LTEuNzk1LTQtNCAwLTIuMjA2IDEuNzk0LTQgNC00czQgMS43OTQgNCA0YzAgMi4yMDUtMS43OTQgNC00IDRNOCAxLjI1YTYuNzUgNi43NSAwIDEgMCAwIDEzLjUgNi43NSA2Ljc1IDAgMCAwIDAtMTMuNVwiPjwvcGF0aD48cGF0aCBjbGFzcz1cImlubmVyX2xvY2F0aW9uX3N0cm9rZVwiIGQ9XCJNOCA1YTMgMyAwIDEgMSAuMDAxIDZBMyAzIDAgMCAxIDggNW0wLTFDNS43OTQgNCA0IDUuNzk0IDQgOGMwIDIuMjA1IDEuNzk0IDQgNCA0czQtMS43OTUgNC00YzAtMi4yMDYtMS43OTQtNC00LTRcIj48L3BhdGg+PHBhdGggY2xhc3M9XCJvdXRlcl9sb2NhdGlvbl9zdHJva2VcIiBkPVwiTTggMS4yNWE2Ljc1IDYuNzUgMCAxIDEgMCAxMy41IDYuNzUgNi43NSAwIDAgMSAwLTEzLjVNOCAwQzMuNTkgMCAwIDMuNTkgMCA4YzAgNC40MTEgMy41OSA4IDggOHM4LTMuNTg5IDgtOGMwLTQuNDEtMy41OS04LTgtOFwiPjwvcGF0aD48L3N2Zz4nO1xuXG4gICAgICAgIHZhciB1c2VyQ29udHJvbEJ1dHRvbiA9IG5ldyBILnVpLmJhc2UuQnV0dG9uKHtcbiAgICAgICAgICAgIGxhYmVsOiBtYXJrdXAsXG4gICAgICAgICAgICBvblN0YXRlQ2hhbmdlOiBmdW5jdGlvbihldnQpIHtcbiAgICAgICAgICAgICAgICBpZiAodXNlckNvbnRyb2xCdXR0b24uZ2V0U3RhdGUoKSA9PT0gSC51aS5iYXNlLkJ1dHRvbi5TdGF0ZS5ET1dOKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgICAgICBIZXJlTWFwc0FQSVNlcnZpY2UuZ2V0UG9zaXRpb24oKS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwb3NpdGlvbiA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxuZzogcmVzcG9uc2UuY29vcmRzLmxvbmdpdHVkZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxhdDogcmVzcG9uc2UuY29vcmRzLmxhdGl0dWRlXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBzZWxmLm1hcC5zZXRDZW50ZXIocG9zaXRpb24pO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgSGVyZU1hcHNVdGlsc1NlcnZpY2Uuem9vbShzZWxmLm1hcCwgMTcsIC4wOCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHNlbGYudXNlck1hcmtlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi51c2VyTWFya2VyLnNldFBvc2l0aW9uKHBvc2l0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgc2VsZi51c2VyTWFya2VyID0gSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLmFkZFVzZXJNYXJrZXIoc2VsZi5tYXAsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvczogcG9zaXRpb25cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHVzZXJDb250cm9sLmFkZENoaWxkKHVzZXJDb250cm9sQnV0dG9uKTtcblxuICAgICAgICByZXR1cm4gdXNlckNvbnRyb2w7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0Q29udHJvbHNBbGlnbm1lbnQoTkFNRVMpIHtcbiAgICAgICAgaWYgKCFVSS5pc1ZhbGlkQWxpZ25tZW50KHRoaXMuYWxpZ25tZW50KSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBmb3IgKHZhciBpZCBpbiBOQU1FUykge1xuICAgICAgICAgICAgdmFyIGNvbnRyb2wgPSB0aGlzLnVpLmdldENvbnRyb2woTkFNRVNbaWRdKTtcblxuICAgICAgICAgICAgaWYgKCFOQU1FUy5oYXNPd25Qcm9wZXJ0eShpZCkgfHwgIWNvbnRyb2wpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnRyb2wuc2V0QWxpZ25tZW50KHRoaXMuYWxpZ25tZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzVmFsaWRBbGlnbm1lbnQoYWxpZ25tZW50KSB7XG4gICAgICAgIHJldHVybiAhIShIZXJlTWFwc0NPTlNUUy5DT05UUk9MUy5QT1NJVElPTlMuaW5kZXhPZihhbGlnbm1lbnQpICsgMSk7XG4gICAgfVxuXG59OyIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG9wdGlvbnMgPSB7fTtcbiAgICB2YXIgREVGQVVMVF9BUElfVkVSU0lPTiA9IFwiMy4xXCI7XG5cbiAgICB0aGlzLiRnZXQgPSBmdW5jdGlvbigpe1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgYXBwX2lkOiBvcHRpb25zLmFwcF9pZCxcbiAgICAgICAgICAgIGFwcF9jb2RlOiBvcHRpb25zLmFwcF9jb2RlLFxuICAgICAgICAgICAgYXBpS2V5OiBvcHRpb25zLmFwaUtleSxcbiAgICAgICAgICAgIGFwaVZlcnNpb246IG9wdGlvbnMuYXBpVmVyc2lvbiB8fCBERUZBVUxUX0FQSV9WRVJTSU9OLFxuICAgICAgICAgICAgdXNlSFRUUFM6IG9wdGlvbnMudXNlSFRUUFMsXG4gICAgICAgICAgICB1c2VDSVQ6ICEhb3B0aW9ucy51c2VDSVQsXG4gICAgICAgICAgICBtYXBUaWxlQ29uZmlnOiBvcHRpb25zLm1hcFRpbGVDb25maWdcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICB0aGlzLnNldE9wdGlvbnMgPSBmdW5jdGlvbihvcHRzKXtcbiAgICAgICAgb3B0aW9ucyA9IG9wdHM7XG4gICAgfTtcbn07IiwiXG5tb2R1bGUuZXhwb3J0cyA9IEhlcmVNYXBzVXRpbHNTZXJ2aWNlO1xuXG5IZXJlTWFwc1V0aWxzU2VydmljZS4kaW5qZWN0ID0gW1xuICAgICckcm9vdFNjb3BlJywgXG4gICAgJyR0aW1lb3V0JywgXG4gICAgJ0hlcmVNYXBzQ09OU1RTJ1xuXTtcbmZ1bmN0aW9uIEhlcmVNYXBzVXRpbHNTZXJ2aWNlKCRyb290U2NvcGUsICR0aW1lb3V0LCBIZXJlTWFwc0NPTlNUUykge1xuICAgIHJldHVybiB7XG4gICAgICAgIHRocm90dGxlOiB0aHJvdHRsZSxcbiAgICAgICAgY3JlYXRlU2NyaXB0VGFnOiBjcmVhdGVTY3JpcHRUYWcsXG4gICAgICAgIGNyZWF0ZUxpbmtUYWc6IGNyZWF0ZUxpbmtUYWcsXG4gICAgICAgIHJ1blNjb3BlRGlnZXN0SWZOZWVkOiBydW5TY29wZURpZ2VzdElmTmVlZCxcbiAgICAgICAgaXNWYWxpZENvb3JkczogaXNWYWxpZENvb3JkcyxcbiAgICAgICAgYWRkRXZlbnRMaXN0ZW5lcjogYWRkRXZlbnRMaXN0ZW5lcixcbiAgICAgICAgem9vbTogem9vbSxcbiAgICAgICAgZ2V0Qm91bmRzUmVjdEZyb21Qb2ludHM6IGdldEJvdW5kc1JlY3RGcm9tUG9pbnRzLFxuICAgICAgICBnZW5lcmF0ZUlkOiBnZW5lcmF0ZUlkLFxuICAgICAgICBnZXRNYXBGYWN0b3J5OiBnZXRNYXBGYWN0b3J5XG4gICAgfTtcblxuICAgIC8vI3JlZ2lvbiBQVUJMSUNcbiAgICBmdW5jdGlvbiB0aHJvdHRsZShmbiwgcGVyaW9kKSB7XG4gICAgICAgIHZhciB0aW1lb3V0ID0gbnVsbDtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKCR0aW1lb3V0KVxuICAgICAgICAgICAgICAgICR0aW1lb3V0LmNhbmNlbCh0aW1lb3V0KTtcblxuICAgICAgICAgICAgdGltZW91dCA9ICR0aW1lb3V0KGZuLCBwZXJpb2QpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYWRkRXZlbnRMaXN0ZW5lcihvYmosIGV2ZW50TmFtZSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpIHtcbiAgICAgICAgb2JqLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBsaXN0ZW5lciwgISF1c2VDYXB0dXJlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBydW5TY29wZURpZ2VzdElmTmVlZChzY29wZSwgY2IpIHtcbiAgICAgICAgaWYgKHNjb3BlLiRyb290ICYmIHNjb3BlLiRyb290LiQkcGhhc2UgIT09ICckYXBwbHknICYmIHNjb3BlLiRyb290LiQkcGhhc2UgIT09ICckZGlnZXN0Jykge1xuICAgICAgICAgICAgc2NvcGUuJGRpZ2VzdChjYiB8fCBhbmd1bGFyLm5vb3ApO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZVNjcmlwdFRhZyhhdHRycykge1xuICAgICAgICB2YXIgc2NyaXB0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYXR0cnMuc3JjKTtcblxuICAgICAgICBpZiAoc2NyaXB0KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuICAgICAgICBzY3JpcHQudHlwZSA9ICd0ZXh0L2phdmFzY3JpcHQnO1xuICAgICAgICBzY3JpcHQuaWQgPSBhdHRycy5zcmM7XG4gICAgICAgIF9zZXRBdHRycyhzY3JpcHQsIGF0dHJzKTtcblxuICAgICAgICByZXR1cm4gc2NyaXB0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZUxpbmtUYWcoYXR0cnMpIHtcbiAgICAgICAgdmFyIGxpbmsgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhdHRycy5ocmVmKTtcblxuICAgICAgICBpZiAobGluaylcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGluaycpO1xuICAgICAgICBsaW5rLmlkID0gYXR0cnMuaHJlZjtcbiAgICAgICAgX3NldEF0dHJzKGxpbmssIGF0dHJzKTtcblxuICAgICAgICByZXR1cm4gbGluaztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc1ZhbGlkQ29vcmRzKGNvb3Jkcykge1xuICAgICAgICByZXR1cm4gY29vcmRzICYmXG4gICAgICAgICAgICAodHlwZW9mIGNvb3Jkcy5sYXRpdHVkZSA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIGNvb3Jkcy5sYXRpdHVkZSA9PT0gJ251bWJlcicpICYmXG4gICAgICAgICAgICAodHlwZW9mIGNvb3Jkcy5sb25naXR1ZGUgPT09ICdzdHJpbmcnIHx8IHR5cGVvZiBjb29yZHMubG9uZ2l0dWRlID09PSAnbnVtYmVyJylcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB6b29tKG1hcCwgdmFsdWUsIHN0ZXApIHtcbiAgICAgICAgdmFyIGN1cnJlbnRab29tID0gbWFwLmdldFpvb20oKSxcbiAgICAgICAgICAgIF9zdGVwID0gc3RlcCB8fCBIZXJlTWFwc0NPTlNUUy5BTklNQVRJT05fWk9PTV9TVEVQLFxuICAgICAgICAgICAgZmFjdG9yID0gY3VycmVudFpvb20gPj0gdmFsdWUgPyAtMSA6IDEsXG4gICAgICAgICAgICBpbmNyZW1lbnQgPSBzdGVwICogZmFjdG9yO1xuXG4gICAgICAgIHJldHVybiAoZnVuY3Rpb24gem9vbSgpIHtcbiAgICAgICAgICAgIGlmICghc3RlcCB8fCBNYXRoLmZsb29yKGN1cnJlbnRab29tKSA9PT0gTWF0aC5mbG9vcih2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICBtYXAuc2V0Wm9vbSh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjdXJyZW50Wm9vbSArPSBpbmNyZW1lbnQ7XG4gICAgICAgICAgICBtYXAuc2V0Wm9vbShjdXJyZW50Wm9vbSk7XG5cbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh6b29tKTtcbiAgICAgICAgfSkoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRNYXBGYWN0b3J5KCl7XG4gICAgICAgIHJldHVybiBIO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0Qm91bmRzUmVjdEZyb21Qb2ludHNcbiAgICAgKiBcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdG9wTGVmdCBcbiAgICAgKiAgQHByb3BlcnR5IHtOdW1iZXJ8U3RyaW5nfSBsYXRcbiAgICAgKiAgQHByb3BlcnR5IHtOdW1iZXJ8U3RyaW5nfSBsbmdcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gYm90dG9tUmlnaHQgXG4gICAgICogIEBwcm9wZXJ0eSB7TnVtYmVyfFN0cmluZ30gbGF0XG4gICAgICogIEBwcm9wZXJ0eSB7TnVtYmVyfFN0cmluZ30gbG5nXG4gICAgICogXG4gICAgICogQHJldHVybiB7SC5nZW8uUmVjdH1cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRCb3VuZHNSZWN0RnJvbVBvaW50cyh0b3BMZWZ0LCBib3R0b21SaWdodCkge1xuICAgICAgICByZXR1cm4gSC5nZW8uUmVjdC5mcm9tUG9pbnRzKHRvcExlZnQsIGJvdHRvbVJpZ2h0LCB0cnVlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZW5lcmF0ZUlkKCkge1xuICAgICAgICB2YXIgbWFzayA9ICd4eHh4eHh4eC14eHh4LTR4eHgteXh4eC14eHh4eHh4eHh4eHgnLFxuICAgICAgICAgICAgcmVnZXhwID0gL1t4eV0vZyxcbiAgICAgICAgICAgIGQgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSxcbiAgICAgICAgICAgIHV1aWQgPSBtYXNrLnJlcGxhY2UocmVnZXhwLCBmdW5jdGlvbiAoYykge1xuICAgICAgICAgICAgICAgIHZhciByID0gKGQgKyBNYXRoLnJhbmRvbSgpICogMTYpICUgMTYgfCAwO1xuICAgICAgICAgICAgICAgIGQgPSBNYXRoLmZsb29yKGQgLyAxNik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIChjID09ICd4JyA/IHIgOiAociAmIDB4MyB8IDB4OCkpLnRvU3RyaW5nKDE2KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB1dWlkO1xuICAgIH1cblxuICAgIC8vI2VuZHJlZ2lvbiBQVUJMSUMgXG5cbiAgICBmdW5jdGlvbiBfc2V0QXR0cnMoZWwsIGF0dHJzKSB7XG4gICAgICAgIGlmICghZWwgfHwgIWF0dHJzKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzZWQgYXR0cmlidXRlcycpO1xuXG4gICAgICAgIGZvciAodmFyIGtleSBpbiBhdHRycykge1xuICAgICAgICAgICAgaWYgKCFhdHRycy5oYXNPd25Qcm9wZXJ0eShrZXkpKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBlbFtrZXldID0gYXR0cnNba2V5XTtcbiAgICAgICAgfVxuICAgIH1cbn07IiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc0RlZmF1bHRNYXJrZXI7XG5cbkhlcmVNYXBzRGVmYXVsdE1hcmtlci4kaW5qZWN0ID0gWydIZXJlTWFwc01hcmtlckludGVyZmFjZSddO1xuZnVuY3Rpb24gSGVyZU1hcHNEZWZhdWx0TWFya2VyKEhlcmVNYXBzTWFya2VySW50ZXJmYWNlKXtcbiAgICBmdW5jdGlvbiBEZWZhdWx0TWFya2VyKHBsYWNlKXtcbiAgICAgICAgdGhpcy5wbGFjZSA9IHBsYWNlO1xuICAgICAgICB0aGlzLnNldENvb3JkcygpO1xuICAgIH1cblxuICAgIHZhciBwcm90byA9IERlZmF1bHRNYXJrZXIucHJvdG90eXBlID0gbmV3IEhlcmVNYXBzTWFya2VySW50ZXJmYWNlKCk7XG4gICAgcHJvdG8uY29uc3RydWN0b3IgPSBEZWZhdWx0TWFya2VyO1xuXG4gICAgcHJvdG8uY3JlYXRlID0gY3JlYXRlO1xuXG4gICAgcmV0dXJuIERlZmF1bHRNYXJrZXI7XG4gICAgXG4gICAgZnVuY3Rpb24gY3JlYXRlKCl7XG4gICAgICAgIHZhciBtYXJrZXIgPSBuZXcgSC5tYXAuTWFya2VyKHRoaXMuY29vcmRzKTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMuYWRkSW5mb0J1YmJsZShtYXJrZXIpO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIG1hcmtlcjtcbiAgICB9XG59IiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc0RPTU1hcmtlcjtcblxuSGVyZU1hcHNET01NYXJrZXIuJGluamVjdCA9IFsnSGVyZU1hcHNNYXJrZXJJbnRlcmZhY2UnXTtcbmZ1bmN0aW9uIEhlcmVNYXBzRE9NTWFya2VyKEhlcmVNYXBzTWFya2VySW50ZXJmYWNlKXtcbiAgICBmdW5jdGlvbiBET01NYXJrZXIocGxhY2Upe1xuICAgICAgICB0aGlzLnBsYWNlID0gcGxhY2U7XG4gICAgICAgIHRoaXMuc2V0Q29vcmRzKCk7XG4gICAgfVxuXG4gICAgdmFyIHByb3RvID0gRE9NTWFya2VyLnByb3RvdHlwZSA9IG5ldyBIZXJlTWFwc01hcmtlckludGVyZmFjZSgpO1xuICAgIHByb3RvLmNvbnN0cnVjdG9yID0gRE9NTWFya2VyO1xuXG4gICAgcHJvdG8uY3JlYXRlID0gY3JlYXRlO1xuICAgIHByb3RvLmdldEljb24gPSBnZXRJY29uO1xuICAgIHByb3RvLnNldHVwRXZlbnRzID0gc2V0dXBFdmVudHM7XG5cbiAgICByZXR1cm4gRE9NTWFya2VyO1xuICAgIFxuICAgIGZ1bmN0aW9uIGNyZWF0ZSgpe1xuICAgICAgICB2YXIgbWFya2VyID0gbmV3IEgubWFwLkRvbU1hcmtlcih0aGlzLmNvb3Jkcywge1xuICAgICAgICAgICAgaWNvbjogdGhpcy5nZXRJY29uKClcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmFkZEluZm9CdWJibGUobWFya2VyKTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBtYXJrZXI7XG4gICAgfVxuICAgIFxuICAgIGZ1bmN0aW9uIGdldEljb24oKXtcbiAgICAgICAgdmFyIGljb24gPSB0aGlzLnBsYWNlLm1hcmt1cDtcbiAgICAgICAgIGlmKCFpY29uKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXJrdXAgbWlzc2VkJyk7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBILm1hcC5Eb21JY29uKGljb24pO1xuICAgIH1cbiAgICBcbiAgICBmdW5jdGlvbiBzZXR1cEV2ZW50cyhlbCwgZXZlbnRzLCByZW1vdmUpe1xuICAgICAgICB2YXIgbWV0aG9kID0gcmVtb3ZlID8gJ3JlbW92ZUV2ZW50TGlzdGVuZXInIDogJ2FkZEV2ZW50TGlzdGVuZXInO1xuXG4gICAgICAgIGZvcih2YXIga2V5IGluIGV2ZW50cykge1xuICAgICAgICAgICAgaWYoIWV2ZW50cy5oYXNPd25Qcm9wZXJ0eShrZXkpKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBlbFttZXRob2RdLmNhbGwobnVsbCwga2V5LCBldmVudHNba2V5XSk7XG4gICAgICAgIH1cbiAgICB9XG59IiwibW9kdWxlLmV4cG9ydHMgPSBhbmd1bGFyLm1vZHVsZSgnaGVyZW1hcHMtbWFya2Vycy1tb2R1bGUnLCBbXSlcbiAgICAuZmFjdG9yeSgnSGVyZU1hcHNNYXJrZXJJbnRlcmZhY2UnLCByZXF1aXJlKCcuL21hcmtlci5qcycpKVxuICAgIC5mYWN0b3J5KCdIZXJlTWFwc0RlZmF1bHRNYXJrZXInLCByZXF1aXJlKCcuL2RlZmF1bHQubWFya2VyLmpzJykpXG4gICAgLmZhY3RvcnkoJ0hlcmVNYXBzRE9NTWFya2VyJywgcmVxdWlyZSgnLi9kb20ubWFya2VyLmpzJykpXG4gICAgLmZhY3RvcnkoJ0hlcmVNYXBzU1ZHTWFya2VyJywgcmVxdWlyZSgnLi9zdmcubWFya2VyLmpzJykpXG4gICAgLnNlcnZpY2UoJ0hlcmVNYXBzTWFya2VyU2VydmljZScsIHJlcXVpcmUoJy4vbWFya2Vycy5zZXJ2aWNlLmpzJykpOyIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKXtcbiAgICBmdW5jdGlvbiBNYXJrZXJJbnRlcmZhY2UoKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdBYnN0cmFjdCBjbGFzcyEgVGhlIEluc3RhbmNlIHNob3VsZCBiZSBjcmVhdGVkJyk7XG4gICAgfVxuICAgIFxuICAgIHZhciBwcm90byA9IE1hcmtlckludGVyZmFjZS5wcm90b3R5cGU7XG4gICAgXG4gICAgcHJvdG8uY3JlYXRlID0gY3JlYXRlO1xuICAgIHByb3RvLnNldENvb3JkcyA9IHNldENvb3JkcztcbiAgICBwcm90by5hZGRJbmZvQnViYmxlID0gYWRkSW5mb0J1YmJsZTtcbiAgICBcbiAgICBmdW5jdGlvbiBNYXJrZXIoKXt9XG4gICAgXG4gICAgTWFya2VyLnByb3RvdHlwZSA9IHByb3RvO1xuICAgIFxuICAgIHJldHVybiBNYXJrZXI7XG4gICAgXG4gICAgZnVuY3Rpb24gY3JlYXRlKCl7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignY3JlYXRlOjogbm90IGltcGxlbWVudGVkJyk7IFxuICAgIH1cbiAgICBcbiAgICBmdW5jdGlvbiBzZXRDb29yZHMoKXtcbiAgICAgICAgIHRoaXMuY29vcmRzID0ge1xuICAgICAgICAgICAgbGF0OiB0aGlzLnBsYWNlLnBvcy5sYXQsXG4gICAgICAgICAgICBsbmc6IHRoaXMucGxhY2UucG9zLmxuZ1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIGZ1bmN0aW9uIGFkZEluZm9CdWJibGUobWFya2VyKXtcbiAgICAgICAgaWYoIXRoaXMucGxhY2UucG9wdXApXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBcbiAgICAgICAgbWFya2VyLnNldERhdGEodGhpcy5wbGFjZS5wb3B1cClcbiAgICB9XG59IiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc01hcmtlclNlcnZpY2U7XG5cbkhlcmVNYXBzTWFya2VyU2VydmljZS4kaW5qZWN0ID0gW1xuICAgICdIZXJlTWFwc0RlZmF1bHRNYXJrZXInLFxuICAgICdIZXJlTWFwc0RPTU1hcmtlcicsXG4gICAgJ0hlcmVNYXBzU1ZHTWFya2VyJyxcbiAgICAnSGVyZU1hcHNDT05TVFMnXG5dO1xuZnVuY3Rpb24gSGVyZU1hcHNNYXJrZXJTZXJ2aWNlKEhlcmVNYXBzRGVmYXVsdE1hcmtlciwgSGVyZU1hcHNET01NYXJrZXIsIEhlcmVNYXBzU1ZHTWFya2VyLCBIZXJlTWFwc0NPTlNUUykge1xuICAgIHZhciBNQVJLRVJfVFlQRVMgPSBIZXJlTWFwc0NPTlNUUy5NQVJLRVJfVFlQRVM7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBhZGRNYXJrZXJzVG9NYXA6IGFkZE1hcmtlcnNUb01hcCxcbiAgICAgICAgYWRkVXNlck1hcmtlcjogYWRkVXNlck1hcmtlcixcbiAgICAgICAgdXBkYXRlTWFya2VyczogdXBkYXRlTWFya2VycyxcbiAgICAgICAgaXNNYXJrZXJJbnN0YW5jZTogaXNNYXJrZXJJbnN0YW5jZSxcbiAgICAgICAgc2V0Vmlld0JvdW5kczogc2V0Vmlld0JvdW5kc1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzTWFya2VySW5zdGFuY2UodGFyZ2V0KSB7XG4gICAgICAgIHJldHVybiB0YXJnZXQgaW5zdGFuY2VvZiBILm1hcC5NYXJrZXIgfHwgdGFyZ2V0IGluc3RhbmNlb2YgSC5tYXAuRG9tTWFya2VyO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFkZFVzZXJNYXJrZXIobWFwLCBwbGFjZSkge1xuICAgICAgICBpZiAobWFwLnVzZXJNYXJrZXIpXG4gICAgICAgICAgICByZXR1cm4gbWFwLnVzZXJNYXJrZXI7XG5cbiAgICAgICAgcGxhY2UubWFya3VwID0gJzxzdmcgd2lkdGg9XCIzNXB4XCIgaGVpZ2h0PVwiMzVweFwiIHZpZXdCb3g9XCIwIDAgOTAgOTBcIiB2ZXJzaW9uPVwiMS4xXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHhtbG5zOnhsaW5rPVwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGlua1wiPicgK1xuICAgICAgICAgICAgJzxkZWZzPjxjaXJjbGUgaWQ9XCJwYXRoLTFcIiBjeD1cIjMwMlwiIGN5PVwiODAyXCIgcj1cIjE1XCI+PC9jaXJjbGU+JyArXG4gICAgICAgICAgICAnPG1hc2sgaWQ9XCJtYXNrLTJcIiBtYXNrQ29udGVudFVuaXRzPVwidXNlclNwYWNlT25Vc2VcIiBtYXNrVW5pdHM9XCJvYmplY3RCb3VuZGluZ0JveFwiIHg9XCItMzBcIiB5PVwiLTMwXCIgd2lkdGg9XCI5MFwiIGhlaWdodD1cIjkwXCI+JyArXG4gICAgICAgICAgICAnPHJlY3QgeD1cIjI1N1wiIHk9XCI3NTdcIiB3aWR0aD1cIjkwXCIgaGVpZ2h0PVwiOTBcIiBmaWxsPVwid2hpdGVcIj48L3JlY3Q+PHVzZSB4bGluazpocmVmPVwiI3BhdGgtMVwiIGZpbGw9XCJibGFja1wiPjwvdXNlPicgK1xuICAgICAgICAgICAgJzwvbWFzaz48L2RlZnM+PGcgaWQ9XCJQYWdlLTFcIiBzdHJva2U9XCJub25lXCIgc3Ryb2tlLXdpZHRoPVwiMVwiIGZpbGw9XCJub25lXCIgZmlsbC1ydWxlPVwiZXZlbm9kZFwiPicgK1xuICAgICAgICAgICAgJzxnIGlkPVwiU2VydmljZS1PcHRpb25zLS0tZGlyZWN0aW9ucy0tLW1hcFwiIHRyYW5zZm9ybT1cInRyYW5zbGF0ZSgtMjU3LjAwMDAwMCwgLTc1Ny4wMDAwMDApXCI+PGcgaWQ9XCJPdmFsLTE1XCI+JyArXG4gICAgICAgICAgICAnPHVzZSBmaWxsPVwiI0ZGRkZGRlwiIGZpbGwtcnVsZT1cImV2ZW5vZGRcIiB4bGluazpocmVmPVwiI3BhdGgtMVwiPjwvdXNlPicgK1xuICAgICAgICAgICAgJzx1c2Ugc3Ryb2tlLW9wYWNpdHk9XCIwLjI5NjEzOTA0XCIgc3Ryb2tlPVwiIzNGMzRBMFwiIG1hc2s9XCJ1cmwoI21hc2stMilcIiBzdHJva2Utd2lkdGg9XCI2MFwiIHhsaW5rOmhyZWY9XCIjcGF0aC0xXCI+PC91c2U+JyArXG4gICAgICAgICAgICAnPHVzZSBzdHJva2U9XCIjM0YzNEEwXCIgc3Ryb2tlLXdpZHRoPVwiNVwiIHhsaW5rOmhyZWY9XCIjcGF0aC0xXCI+PC91c2U+PC9nPjwvZz48L2c+PC9zdmc+JztcblxuICAgICAgICBtYXAudXNlck1hcmtlciA9IG5ldyBIZXJlTWFwc1NWR01hcmtlcihwbGFjZSkuY3JlYXRlKCk7XG5cbiAgICAgICAgbWFwLmFkZE9iamVjdChtYXAudXNlck1hcmtlcik7XG5cbiAgICAgICAgcmV0dXJuIG1hcC51c2VyTWFya2VyO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFkZE1hcmtlcnNUb01hcChtYXAsIHBsYWNlcywgcmVmcmVzaFZpZXdib3VuZHMpIHtcbiAgICAgICAgaWYgKCFwbGFjZXMgfHwgIXBsYWNlcy5sZW5ndGgpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKCEobWFwIGluc3RhbmNlb2YgSC5NYXApKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBtYXAgaW5zdGFuY2UnKTtcblxuICAgICAgICBpZiAoIW1hcC5tYXJrZXJzR3JvdXApXG4gICAgICAgICAgICBtYXAubWFya2Vyc0dyb3VwID0gbmV3IEgubWFwLkdyb3VwKCk7XG5cbiAgICAgICAgcGxhY2VzLmZvckVhY2goZnVuY3Rpb24gKHBsYWNlLCBpKSB7XG4gICAgICAgICAgICB2YXIgY3JlYXRvciA9IF9nZXRNYXJrZXJDcmVhdG9yKHBsYWNlKSxcbiAgICAgICAgICAgICAgICBtYXJrZXIgPSBwbGFjZS5kcmFnZ2FibGUgPyBfZHJhZ2dhYmxlTWFya2VyTWl4aW4oY3JlYXRvci5jcmVhdGUoKSkgOiBjcmVhdG9yLmNyZWF0ZSgpO1xuXG4gICAgICAgICAgICBtYXAubWFya2Vyc0dyb3VwLmFkZE9iamVjdChtYXJrZXIpO1xuICAgICAgICB9KTtcblxuICAgICAgICBtYXAuYWRkT2JqZWN0KG1hcC5tYXJrZXJzR3JvdXApO1xuXG4gICAgICAgIGlmIChyZWZyZXNoVmlld2JvdW5kcykge1xuICAgICAgICAgICAgc2V0Vmlld0JvdW5kcyhtYXAsIG1hcC5tYXJrZXJzR3JvdXAuZ2V0Qm91bmRzKCkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0Vmlld0JvdW5kcyhtYXAsIGJvdW5kcywgb3B0X2FuaW1hdGUpIHtcbiAgICAgICAgbWFwLnNldFZpZXdCb3VuZHMoYm91bmRzLCAhIW9wdF9hbmltYXRlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB1cGRhdGVNYXJrZXJzKG1hcCwgcGxhY2VzLCByZWZyZXNoVmlld2JvdW5kcykge1xuICAgICAgICBpZiAobWFwLm1hcmtlcnNHcm91cCkge1xuICAgICAgICAgICAgbWFwLm1hcmtlcnNHcm91cC5yZW1vdmVBbGwoKTtcbiAgICAgICAgICAgIG1hcC5yZW1vdmVPYmplY3QobWFwLm1hcmtlcnNHcm91cCk7XG4gICAgICAgICAgICBtYXAubWFya2Vyc0dyb3VwID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGFkZE1hcmtlcnNUb01hcC5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9nZXRNYXJrZXJDcmVhdG9yKHBsYWNlKSB7XG4gICAgICAgIHZhciBDb25jcmV0ZU1hcmtlcixcbiAgICAgICAgICAgIHR5cGUgPSBwbGFjZS50eXBlID8gcGxhY2UudHlwZS50b1VwcGVyQ2FzZSgpIDogbnVsbDtcblxuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgTUFSS0VSX1RZUEVTLkRPTTpcbiAgICAgICAgICAgICAgICBDb25jcmV0ZU1hcmtlciA9IEhlcmVNYXBzRE9NTWFya2VyO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBNQVJLRVJfVFlQRVMuU1ZHOlxuICAgICAgICAgICAgICAgIENvbmNyZXRlTWFya2VyID0gSGVyZU1hcHNTVkdNYXJrZXI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIENvbmNyZXRlTWFya2VyID0gSGVyZU1hcHNEZWZhdWx0TWFya2VyO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBDb25jcmV0ZU1hcmtlcihwbGFjZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2RyYWdnYWJsZU1hcmtlck1peGluKG1hcmtlcikge1xuICAgICAgICBtYXJrZXIuZHJhZ2dhYmxlID0gdHJ1ZTtcblxuICAgICAgICByZXR1cm4gbWFya2VyO1xuICAgIH1cbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IEhlcmVNYXBzU1ZHTWFya2VyO1xuXG5IZXJlTWFwc1NWR01hcmtlci4kaW5qZWN0ID0gWydIZXJlTWFwc01hcmtlckludGVyZmFjZSddO1xuZnVuY3Rpb24gSGVyZU1hcHNTVkdNYXJrZXIoSGVyZU1hcHNNYXJrZXJJbnRlcmZhY2Upe1xuICAgIGZ1bmN0aW9uIFNWR01hcmtlcihwbGFjZSl7XG4gICAgICAgIHRoaXMucGxhY2UgPSBwbGFjZTtcbiAgICAgICAgdGhpcy5zZXRDb29yZHMoKTtcbiAgICB9XG4gICAgXG4gICAgdmFyIHByb3RvID0gU1ZHTWFya2VyLnByb3RvdHlwZSA9IG5ldyBIZXJlTWFwc01hcmtlckludGVyZmFjZSgpO1xuICAgIHByb3RvLmNvbnN0cnVjdG9yID0gU1ZHTWFya2VyO1xuICAgIFxuICAgIHByb3RvLmNyZWF0ZSA9IGNyZWF0ZTtcbiAgICBwcm90by5nZXRJY29uID0gZ2V0SWNvbjtcbiAgICBcbiAgICByZXR1cm4gU1ZHTWFya2VyO1xuICAgIFxuICAgIGZ1bmN0aW9uIGNyZWF0ZSgpe1xuICAgICAgICB2YXIgbWFya2VyID0gbmV3IEgubWFwLk1hcmtlcih0aGlzLmNvb3Jkcywge1xuICAgICAgICAgICAgaWNvbjogdGhpcy5nZXRJY29uKCksXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgdGhpcy5hZGRJbmZvQnViYmxlKG1hcmtlcik7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gbWFya2VyO1xuICAgIH1cbiAgICBcbiAgICBmdW5jdGlvbiBnZXRJY29uKCl7XG4gICAgICAgIHZhciBpY29uID0gdGhpcy5wbGFjZS5tYXJrdXA7XG4gICAgICAgICBpZighaWNvbilcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignbWFya3VwIG1pc3NlZCcpO1xuXG4gICAgICAgIHJldHVybiBuZXcgSC5tYXAuSWNvbihpY29uKTtcbiAgICB9XG59IiwibW9kdWxlLmV4cG9ydHMgPSBhbmd1bGFyLm1vZHVsZSgnaGVyZW1hcHMtcm91dGVzLW1vZHVsZScsIFtdKVxuICAgICAgICAgICAgICAgICAgICAuc2VydmljZSgnSGVyZU1hcHNSb3V0ZXNTZXJ2aWNlJywgcmVxdWlyZSgnLi9yb3V0ZXMuc2VydmljZS5qcycpKTsgICIsIm1vZHVsZS5leHBvcnRzID0gSGVyZU1hcHNSb3V0ZXNTZXJ2aWNlO1xuXG5IZXJlTWFwc1JvdXRlc1NlcnZpY2UuJGluamVjdCA9IFsnJHEnLCAnSGVyZU1hcHNNYXJrZXJTZXJ2aWNlJ107XG5mdW5jdGlvbiBIZXJlTWFwc1JvdXRlc1NlcnZpY2UoJHEsIEhlcmVNYXBzTWFya2VyU2VydmljZSkge1xuICAgIHJldHVybiB7XG4gICAgICAgIGNhbGN1bGF0ZVJvdXRlOiBjYWxjdWxhdGVSb3V0ZSxcbiAgICAgICAgYWRkUm91dGVUb01hcDogYWRkUm91dGVUb01hcCxcbiAgICAgICAgY2xlYW5Sb3V0ZXM6IGNsZWFuUm91dGVzXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2FsY3VsYXRlUm91dGUoaGVyZW1hcHMsIGNvbmZpZykge1xuICAgICAgICB2YXIgcGxhdGZvcm0gPSBoZXJlbWFwcy5wbGF0Zm9ybSxcbiAgICAgICAgICAgIG1hcCA9IGhlcmVtYXBzLm1hcCxcbiAgICAgICAgICAgIHJvdXRlciA9IHBsYXRmb3JtLmdldFJvdXRpbmdTZXJ2aWNlKCksXG4gICAgICAgICAgICBkaXIgPSBjb25maWcuZGlyZWN0aW9uLFxuICAgICAgICAgICAgd2F5cG9pbnRzID0gZGlyLndheXBvaW50cztcblxuICAgICAgICB2YXIgbW9kZSA9ICd7e01PREV9fTt7e1ZFQ0hJTEV9fSdcbiAgICAgICAgICAgIC5yZXBsYWNlKC97e01PREV9fS8sIGRpci5tb2RlIHx8ICdmYXN0ZXN0JylcbiAgICAgICAgICAgIC5yZXBsYWNlKC97e1ZFQ0hJTEV9fS8sIGNvbmZpZy5kcml2ZVR5cGUpO1xuXG4gICAgICAgIHZhciByb3V0ZVJlcXVlc3RQYXJhbXMgPSB7XG4gICAgICAgICAgICBtb2RlOiBtb2RlLFxuICAgICAgICAgICAgcmVwcmVzZW50YXRpb246IGRpci5yZXByZXNlbnRhdGlvbiB8fCAnZGlzcGxheScsXG4gICAgICAgICAgICBsYW5ndWFnZTogZGlyLmxhbmd1YWdlIHx8ICdlbi1nYidcbiAgICAgICAgfTtcblxuICAgICAgICB3YXlwb2ludHMuZm9yRWFjaChmdW5jdGlvbiAod2F5cG9pbnQsIGkpIHtcbiAgICAgICAgICAgIHJvdXRlUmVxdWVzdFBhcmFtc1tcIndheXBvaW50XCIgKyBpXSA9IFt3YXlwb2ludC5sYXQsIHdheXBvaW50LmxuZ10uam9pbignLCcpO1xuICAgICAgICB9KTtcblxuICAgICAgICBfc2V0QXR0cmlidXRlcyhyb3V0ZVJlcXVlc3RQYXJhbXMsIGRpci5hdHRycyk7XG5cbiAgICAgICAgdmFyIGRlZmVycmVkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICByb3V0ZXIuY2FsY3VsYXRlUm91dGUocm91dGVSZXF1ZXN0UGFyYW1zLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xlYW5Sb3V0ZXMobWFwKSB7XG4gICAgICAgIHZhciBncm91cCA9IG1hcC5yb3V0ZXNHcm91cDtcblxuICAgICAgICBpZiAoIWdyb3VwKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGdyb3VwLnJlbW92ZUFsbCgpO1xuICAgICAgICBtYXAucmVtb3ZlT2JqZWN0KGdyb3VwKTtcbiAgICAgICAgbWFwLnJvdXRlc0dyb3VwID0gbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhZGRSb3V0ZVRvTWFwKG1hcCwgcm91dGVEYXRhLCBjbGVhbikge1xuICAgICAgICBpZiAoY2xlYW4pXG4gICAgICAgICAgICBjbGVhblJvdXRlcyhtYXApO1xuXG4gICAgICAgIHZhciByb3V0ZSA9IHJvdXRlRGF0YS5yb3V0ZTtcblxuICAgICAgICBpZiAoIW1hcCB8fCAhcm91dGUgfHwgIXJvdXRlLnNoYXBlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBzdHJpcCA9IG5ldyBILmdlby5TdHJpcCgpLCBwb2x5bGluZSA9IG51bGw7XG5cbiAgICAgICAgcm91dGUuc2hhcGUuZm9yRWFjaChmdW5jdGlvbiAocG9pbnQpIHtcbiAgICAgICAgICAgIHZhciBwYXJ0cyA9IHBvaW50LnNwbGl0KCcsJyk7XG4gICAgICAgICAgICBzdHJpcC5wdXNoTGF0TG5nQWx0KHBhcnRzWzBdLCBwYXJ0c1sxXSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBzdHlsZSA9IHJvdXRlRGF0YS5zdHlsZSB8fCB7fTtcblxuICAgICAgICBwb2x5bGluZSA9IG5ldyBILm1hcC5Qb2x5bGluZShzdHJpcCwge1xuICAgICAgICAgICAgc3R5bGU6IHtcbiAgICAgICAgICAgICAgICBsaW5lV2lkdGg6IHN0eWxlLmxpbmVXaWR0aCB8fCA0LFxuICAgICAgICAgICAgICAgIHN0cm9rZUNvbG9yOiBzdHlsZS5jb2xvciB8fCAncmdiYSgwLCAxMjgsIDI1NSwgMC43KSdcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGdyb3VwID0gbWFwLnJvdXRlc0dyb3VwO1xuXG4gICAgICAgIGlmICghZ3JvdXApIHtcbiAgICAgICAgICAgIGdyb3VwID0gbWFwLnJvdXRlc0dyb3VwID0gbmV3IEgubWFwLkdyb3VwKCk7XG4gICAgICAgICAgICBtYXAuYWRkT2JqZWN0KGdyb3VwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGdyb3VwLmFkZE9iamVjdChwb2x5bGluZSk7XG5cbiAgICAgICAgaWYocm91dGVEYXRhLnpvb21Ub0JvdW5kcykge1xuICAgICAgICAgICAgSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLnNldFZpZXdCb3VuZHMobWFwLCBwb2x5bGluZS5nZXRCb3VuZHMoKSwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyNyZWdpb24gUFJJVkFURVxuXG4gICAgZnVuY3Rpb24gX3NldEF0dHJpYnV0ZXMocGFyYW1zLCBhdHRycykge1xuICAgICAgICB2YXIgX2tleSA9ICdhdHRyaWJ1dGVzJztcbiAgICAgICAgZm9yICh2YXIga2V5IGluIGF0dHJzKSB7XG4gICAgICAgICAgICBpZiAoIWF0dHJzLmhhc093blByb3BlcnR5KGtleSkpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIHBhcmFtc1trZXkgKyBfa2V5XSA9IGF0dHJzW2tleV07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgc2VyaWVzIG9mIEgubWFwLk1hcmtlciBwb2ludHMgZnJvbSB0aGUgcm91dGUgYW5kIGFkZHMgdGhlbSB0byB0aGUgbWFwLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSByb3V0ZSAgQSByb3V0ZSBhcyByZWNlaXZlZCBmcm9tIHRoZSBILnNlcnZpY2UuUm91dGluZ1NlcnZpY2VcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhZGRNYW51ZXZlcnNUb01hcChtYXAsIHJvdXRlKSB7XG4gICAgICAgIHZhciBzdmdNYXJrdXAgPSAnPHN2ZyB3aWR0aD1cIjE4XCIgaGVpZ2h0PVwiMThcIiAnICtcbiAgICAgICAgICAgICd4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCI+JyArXG4gICAgICAgICAgICAnPGNpcmNsZSBjeD1cIjhcIiBjeT1cIjhcIiByPVwiOFwiICcgK1xuICAgICAgICAgICAgJ2ZpbGw9XCIjMWI0NjhkXCIgc3Ryb2tlPVwid2hpdGVcIiBzdHJva2Utd2lkdGg9XCIxXCIgIC8+JyArXG4gICAgICAgICAgICAnPC9zdmc+JyxcbiAgICAgICAgICAgIGRvdEljb24gPSBuZXcgSC5tYXAuSWNvbihzdmdNYXJrdXAsIHsgYW5jaG9yOiB7IHg6IDgsIHk6IDggfSB9KSxcbiAgICAgICAgICAgIGdyb3VwID0gbmV3IEgubWFwLkdyb3VwKCksIGksIGo7XG5cbiAgICAgICAgLy8gQWRkIGEgbWFya2VyIGZvciBlYWNoIG1hbmV1dmVyXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3V0ZS5sZWcubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCByb3V0ZS5sZWdbaV0ubWFuZXV2ZXIubGVuZ3RoOyBqICs9IDEpIHtcbiAgICAgICAgICAgICAgICAvLyBHZXQgdGhlIG5leHQgbWFuZXV2ZXIuXG4gICAgICAgICAgICAgICAgbWFuZXV2ZXIgPSByb3V0ZS5sZWdbaV0ubWFuZXV2ZXJbal07XG4gICAgICAgICAgICAgICAgLy8gQWRkIGEgbWFya2VyIHRvIHRoZSBtYW5ldXZlcnMgZ3JvdXBcbiAgICAgICAgICAgICAgICB2YXIgbWFya2VyID0gbmV3IEgubWFwLk1hcmtlcih7XG4gICAgICAgICAgICAgICAgICAgIGxhdDogbWFuZXV2ZXIucG9zaXRpb24ubGF0aXR1ZGUsXG4gICAgICAgICAgICAgICAgICAgIGxuZzogbWFuZXV2ZXIucG9zaXRpb24ubG9uZ2l0dWRlXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBpY29uOiBkb3RJY29uIH1cbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgbWFya2VyLmluc3RydWN0aW9uID0gbWFuZXV2ZXIuaW5zdHJ1Y3Rpb247XG4gICAgICAgICAgICAgICAgZ3JvdXAuYWRkT2JqZWN0KG1hcmtlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBncm91cC5hZGRFdmVudExpc3RlbmVyKCd0YXAnLCBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgICAgICBtYXAuc2V0Q2VudGVyKGV2dC50YXJnZXQuZ2V0UG9zaXRpb24oKSk7XG4gICAgICAgICAgICBvcGVuQnViYmxlKGV2dC50YXJnZXQuZ2V0UG9zaXRpb24oKSwgZXZ0LnRhcmdldC5pbnN0cnVjdGlvbik7XG4gICAgICAgIH0sIGZhbHNlKTtcblxuICAgICAgICAvLyBBZGQgdGhlIG1hbmV1dmVycyBncm91cCB0byB0aGUgbWFwXG4gICAgICAgIG1hcC5hZGRPYmplY3QoZ3JvdXApO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIHNlcmllcyBvZiBILm1hcC5NYXJrZXIgcG9pbnRzIGZyb20gdGhlIHJvdXRlIGFuZCBhZGRzIHRoZW0gdG8gdGhlIG1hcC5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcm91dGUgIEEgcm91dGUgYXMgcmVjZWl2ZWQgZnJvbSB0aGUgSC5zZXJ2aWNlLlJvdXRpbmdTZXJ2aWNlXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkV2F5cG9pbnRzVG9QYW5lbCh3YXlwb2ludHMpIHtcbiAgICAgICAgdmFyIG5vZGVIMyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2gzJyksXG4gICAgICAgICAgICB3YXlwb2ludExhYmVscyA9IFtdLFxuICAgICAgICAgICAgaTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICB3YXlwb2ludExhYmVscy5wdXNoKHdheXBvaW50c1tpXS5sYWJlbClcbiAgICAgICAgfVxuXG4gICAgICAgIG5vZGVIMy50ZXh0Q29udGVudCA9IHdheXBvaW50TGFiZWxzLmpvaW4oJyAtICcpO1xuXG4gICAgICAgIHJvdXRlSW5zdHJ1Y3Rpb25zQ29udGFpbmVyLmlubmVySFRNTCA9ICcnO1xuICAgICAgICByb3V0ZUluc3RydWN0aW9uc0NvbnRhaW5lci5hcHBlbmRDaGlsZChub2RlSDMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBzZXJpZXMgb2YgSC5tYXAuTWFya2VyIHBvaW50cyBmcm9tIHRoZSByb3V0ZSBhbmQgYWRkcyB0aGVtIHRvIHRoZSBtYXAuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHJvdXRlICBBIHJvdXRlIGFzIHJlY2VpdmVkIGZyb20gdGhlIEguc2VydmljZS5Sb3V0aW5nU2VydmljZVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGFkZFN1bW1hcnlUb1BhbmVsKHN1bW1hcnkpIHtcbiAgICAgICAgdmFyIHN1bW1hcnlEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcbiAgICAgICAgICAgIGNvbnRlbnQgPSAnJztcblxuICAgICAgICBjb250ZW50ICs9ICc8Yj5Ub3RhbCBkaXN0YW5jZTwvYj46ICcgKyBzdW1tYXJ5LmRpc3RhbmNlICsgJ20uIDxici8+JztcbiAgICAgICAgY29udGVudCArPSAnPGI+VHJhdmVsIFRpbWU8L2I+OiAnICsgc3VtbWFyeS50cmF2ZWxUaW1lLnRvTU1TUygpICsgJyAoaW4gY3VycmVudCB0cmFmZmljKSc7XG5cblxuICAgICAgICBzdW1tYXJ5RGl2LnN0eWxlLmZvbnRTaXplID0gJ3NtYWxsJztcbiAgICAgICAgc3VtbWFyeURpdi5zdHlsZS5tYXJnaW5MZWZ0ID0gJzUlJztcbiAgICAgICAgc3VtbWFyeURpdi5zdHlsZS5tYXJnaW5SaWdodCA9ICc1JSc7XG4gICAgICAgIHN1bW1hcnlEaXYuaW5uZXJIVE1MID0gY29udGVudDtcbiAgICAgICAgcm91dGVJbnN0cnVjdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQoc3VtbWFyeURpdik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIHNlcmllcyBvZiBILm1hcC5NYXJrZXIgcG9pbnRzIGZyb20gdGhlIHJvdXRlIGFuZCBhZGRzIHRoZW0gdG8gdGhlIG1hcC5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcm91dGUgIEEgcm91dGUgYXMgcmVjZWl2ZWQgZnJvbSB0aGUgSC5zZXJ2aWNlLlJvdXRpbmdTZXJ2aWNlXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkTWFudWV2ZXJzVG9QYW5lbChyb3V0ZSkge1xuICAgICAgICB2YXIgbm9kZU9MID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb2wnKSwgaSwgajtcblxuICAgICAgICBub2RlT0wuc3R5bGUuZm9udFNpemUgPSAnc21hbGwnO1xuICAgICAgICBub2RlT0wuc3R5bGUubWFyZ2luTGVmdCA9ICc1JSc7XG4gICAgICAgIG5vZGVPTC5zdHlsZS5tYXJnaW5SaWdodCA9ICc1JSc7XG4gICAgICAgIG5vZGVPTC5jbGFzc05hbWUgPSAnZGlyZWN0aW9ucyc7XG5cbiAgICAgICAgLy8gQWRkIGEgbWFya2VyIGZvciBlYWNoIG1hbmV1dmVyXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3V0ZS5sZWcubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCByb3V0ZS5sZWdbaV0ubWFuZXV2ZXIubGVuZ3RoOyBqICs9IDEpIHtcbiAgICAgICAgICAgICAgICAvLyBHZXQgdGhlIG5leHQgbWFuZXV2ZXIuXG4gICAgICAgICAgICAgICAgbWFuZXV2ZXIgPSByb3V0ZS5sZWdbaV0ubWFuZXV2ZXJbal07XG5cbiAgICAgICAgICAgICAgICB2YXIgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpLFxuICAgICAgICAgICAgICAgICAgICBzcGFuQXJyb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyksXG4gICAgICAgICAgICAgICAgICAgIHNwYW5JbnN0cnVjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblxuICAgICAgICAgICAgICAgIHNwYW5BcnJvdy5jbGFzc05hbWUgPSAnYXJyb3cgJyArIG1hbmV1dmVyLmFjdGlvbjtcbiAgICAgICAgICAgICAgICBzcGFuSW5zdHJ1Y3Rpb24uaW5uZXJIVE1MID0gbWFuZXV2ZXIuaW5zdHJ1Y3Rpb247XG4gICAgICAgICAgICAgICAgbGkuYXBwZW5kQ2hpbGQoc3BhbkFycm93KTtcbiAgICAgICAgICAgICAgICBsaS5hcHBlbmRDaGlsZChzcGFuSW5zdHJ1Y3Rpb24pO1xuXG4gICAgICAgICAgICAgICAgbm9kZU9MLmFwcGVuZENoaWxkKGxpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJvdXRlSW5zdHJ1Y3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKG5vZGVPTCk7XG4gICAgfVxuXG59O1xuIl19
