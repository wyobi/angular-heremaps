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
            if (!HereMapsConfig.app_id || (!HereMapsConfig.app_code && HereMapsConfig.apiKey))
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
        SERVICE: "mapsjs-service.js",
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
    API_DEFERSQueue[CONFIG.SERVICE] = [];
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
                return _getLoader(CONFIG.SERVICE);
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
    var DEFAULT_API_VERSION = "3.0";

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvaGVyZW1hcHMuZGlyZWN0aXZlLmpzIiwic3JjL2luZGV4LmpzIiwic3JjL3Byb3ZpZGVycy9hcGkuc2VydmljZS5qcyIsInNyYy9wcm92aWRlcnMvY29uc3RzLmpzIiwic3JjL3Byb3ZpZGVycy9tYXAtbW9kdWxlcy9ldmVudHMvZXZlbnRzLmpzIiwic3JjL3Byb3ZpZGVycy9tYXAtbW9kdWxlcy9ldmVudHMvaW5mb2J1YmJsZS5qcyIsInNyYy9wcm92aWRlcnMvbWFwLW1vZHVsZXMvaW5kZXguanMiLCJzcmMvcHJvdmlkZXJzL21hcC1tb2R1bGVzL3VpL3VpLmpzIiwic3JjL3Byb3ZpZGVycy9tYXBjb25maWcucHJvdmlkZXIuanMiLCJzcmMvcHJvdmlkZXJzL21hcHV0aWxzLnNlcnZpY2UuanMiLCJzcmMvcHJvdmlkZXJzL21hcmtlcnMvZGVmYXVsdC5tYXJrZXIuanMiLCJzcmMvcHJvdmlkZXJzL21hcmtlcnMvZG9tLm1hcmtlci5qcyIsInNyYy9wcm92aWRlcnMvbWFya2Vycy9pbmRleC5qcyIsInNyYy9wcm92aWRlcnMvbWFya2Vycy9tYXJrZXIuanMiLCJzcmMvcHJvdmlkZXJzL21hcmtlcnMvbWFya2Vycy5zZXJ2aWNlLmpzIiwic3JjL3Byb3ZpZGVycy9tYXJrZXJzL3N2Zy5tYXJrZXIuanMiLCJzcmMvcHJvdmlkZXJzL3JvdXRlcy9pbmRleC5qcyIsInNyYy9wcm92aWRlcnMvcm91dGVzL3JvdXRlcy5zZXJ2aWNlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIm1vZHVsZS5leHBvcnRzID0gSGVyZU1hcHNEaXJlY3RpdmU7XG5cbkhlcmVNYXBzRGlyZWN0aXZlLiRpbmplY3QgPSBbXG4gICAgJyR0aW1lb3V0JyxcbiAgICAnJHdpbmRvdycsXG4gICAgJyRyb290U2NvcGUnLFxuICAgICckZmlsdGVyJyxcbiAgICAnSGVyZU1hcHNDb25maWcnLFxuICAgICdIZXJlTWFwc0FQSVNlcnZpY2UnLFxuICAgICdIZXJlTWFwc1V0aWxzU2VydmljZScsXG4gICAgJ0hlcmVNYXBzTWFya2VyU2VydmljZScsXG4gICAgJ0hlcmVNYXBzUm91dGVzU2VydmljZScsXG4gICAgJ0hlcmVNYXBzQ09OU1RTJyxcbiAgICAnSGVyZU1hcHNFdmVudHNGYWN0b3J5JyxcbiAgICAnSGVyZU1hcHNVaUZhY3RvcnknXG5dO1xuZnVuY3Rpb24gSGVyZU1hcHNEaXJlY3RpdmUoXG4gICAgJHRpbWVvdXQsXG4gICAgJHdpbmRvdyxcbiAgICAkcm9vdFNjb3BlLFxuICAgICRmaWx0ZXIsXG4gICAgSGVyZU1hcHNDb25maWcsXG4gICAgSGVyZU1hcHNBUElTZXJ2aWNlLFxuICAgIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLFxuICAgIEhlcmVNYXBzTWFya2VyU2VydmljZSxcbiAgICBIZXJlTWFwc1JvdXRlc1NlcnZpY2UsXG4gICAgSGVyZU1hcHNDT05TVFMsXG4gICAgSGVyZU1hcHNFdmVudHNGYWN0b3J5LFxuICAgIEhlcmVNYXBzVWlGYWN0b3J5KSB7XG5cbiAgICBIZXJlTWFwc0RpcmVjdGl2ZUN0cmwuJGluamVjdCA9IFsnJHNjb3BlJywgJyRlbGVtZW50JywgJyRhdHRycyddO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdFQScsXG4gICAgICAgIHRlbXBsYXRlOiBcIjxkaXYgbmctc3R5bGU9XFxcInsnd2lkdGgnOiBtYXBXaWR0aCwgJ2hlaWdodCc6IG1hcEhlaWdodH1cXFwiPjwvZGl2PlwiLFxuICAgICAgICByZXBsYWNlOiB0cnVlLFxuICAgICAgICBzY29wZToge1xuICAgICAgICAgICAgb3B0czogJyZvcHRpb25zJyxcbiAgICAgICAgICAgIHBsYWNlczogJyYnLFxuICAgICAgICAgICAgb25NYXBSZWFkeTogXCImbWFwUmVhZHlcIixcbiAgICAgICAgICAgIGV2ZW50czogJyYnXG4gICAgICAgIH0sXG4gICAgICAgIGNvbnRyb2xsZXI6IEhlcmVNYXBzRGlyZWN0aXZlQ3RybFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIEhlcmVNYXBzRGlyZWN0aXZlQ3RybCgkc2NvcGUsICRlbGVtZW50LCAkYXR0cnMpIHtcbiAgICAgICAgdmFyIENPTlRST0xfTkFNRVMgPSBIZXJlTWFwc0NPTlNUUy5DT05UUk9MUy5OQU1FUyxcbiAgICAgICAgICAgIHBsYWNlcyA9ICRzY29wZS5wbGFjZXMoKSxcbiAgICAgICAgICAgIG9wdHMgPSAkc2NvcGUub3B0cygpLFxuICAgICAgICAgICAgbGlzdGVuZXJzID0gJHNjb3BlLmV2ZW50cygpO1xuXG4gICAgICAgIHZhciBvcHRpb25zID0gYW5ndWxhci5leHRlbmQoe30sIEhlcmVNYXBzQ09OU1RTLkRFRkFVTFRfTUFQX09QVElPTlMsIG9wdHMpLFxuICAgICAgICAgICAgcG9zaXRpb24gPSBIZXJlTWFwc1V0aWxzU2VydmljZS5pc1ZhbGlkQ29vcmRzKG9wdGlvbnMuY29vcmRzKSA/XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5jb29yZHMgOiBIZXJlTWFwc0NPTlNUUy5ERUZBVUxUX01BUF9PUFRJT05TLmNvb3JkcztcblxuICAgICAgICB2YXIgaGVyZW1hcHMgPSB7IGlkOiBIZXJlTWFwc1V0aWxzU2VydmljZS5nZW5lcmF0ZUlkKCkgfSxcbiAgICAgICAgICAgIG1hcFJlYWR5ID0gJHNjb3BlLm9uTWFwUmVhZHkoKSxcbiAgICAgICAgICAgIF9vblJlc2l6ZU1hcCA9IG51bGw7XG5cbiAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIF9zZXRNYXBTaXplKCk7XG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgSGVyZU1hcHNBUElTZXJ2aWNlLmxvYWRBcGkoKS50aGVuKF9hcGlSZWFkeSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIG9wdGlvbnMucmVzaXplICYmIGFkZE9uUmVzaXplTGlzdGVuZXIoKTtcblxuICAgICAgICAkc2NvcGUuJG9uKCckZGVzdHJveScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgX29uUmVzaXplTWFwKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkT25SZXNpemVMaXN0ZW5lcigpIHtcbiAgICAgICAgICAgIF9vblJlc2l6ZU1hcCA9IEhlcmVNYXBzVXRpbHNTZXJ2aWNlLnRocm90dGxlKF9yZXNpemVIYW5kbGVyLCBIZXJlTWFwc0NPTlNUUy5VUERBVEVfTUFQX1JFU0laRV9USU1FT1VUKTtcbiAgICAgICAgICAgICR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgX29uUmVzaXplTWFwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIF9hcGlSZWFkeSgpIHtcbiAgICAgICAgICAgIF9zZXR1cE1hcFBsYXRmb3JtKCk7XG4gICAgICAgICAgICBfc2V0dXBNYXAoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIF9zZXR1cE1hcFBsYXRmb3JtKCkge1xuICAgICAgICAgICAgaWYgKCFIZXJlTWFwc0NvbmZpZy5hcHBfaWQgfHwgKCFIZXJlTWFwc0NvbmZpZy5hcHBfY29kZSAmJiBIZXJlTWFwc0NvbmZpZy5hcGlLZXkpKVxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignYXBwX2lkIG9yIGVpdGhlciBvZiBhcHBfY29kZSBhbmQgYXBpS2V5IHdlcmUgbWlzc2VkLiBQbGVhc2Ugc3BlY2lmeSB0aGVpciBpbiBIZXJlTWFwc0NvbmZpZycpO1xuXG4gICAgICAgICAgICBoZXJlbWFwcy5wbGF0Zm9ybSA9IG5ldyBILnNlcnZpY2UuUGxhdGZvcm0oSGVyZU1hcHNDb25maWcpO1xuICAgICAgICAgICAgaGVyZW1hcHMubGF5ZXJzID0gaGVyZW1hcHMucGxhdGZvcm0uY3JlYXRlRGVmYXVsdExheWVycygpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gX2dldExvY2F0aW9uKGVuYWJsZUhpZ2hBY2N1cmFjeSwgbWF4aW11bUFnZSkge1xuICAgICAgICAgICAgdmFyIF9lbmFibGVIaWdoQWNjdXJhY3kgPSAhIWVuYWJsZUhpZ2hBY2N1cmFjeSxcbiAgICAgICAgICAgICAgICBfbWF4aW11bUFnZSA9IG1heGltdW1BZ2UgfHwgMDtcblxuICAgICAgICAgICAgcmV0dXJuIEhlcmVNYXBzQVBJU2VydmljZS5nZXRQb3NpdGlvbih7XG4gICAgICAgICAgICAgICAgZW5hYmxlSGlnaEFjY3VyYWN5OiBfZW5hYmxlSGlnaEFjY3VyYWN5LFxuICAgICAgICAgICAgICAgIG1heGltdW1BZ2U6IF9tYXhpbXVtQWdlXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIF9sb2NhdGlvbkZhaWx1cmUoKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdDYW4gbm90IGdldCBhIGdlbyBwb3NpdGlvbicpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gX3NldHVwTWFwKCkge1xuICAgICAgICAgICAgX2luaXRNYXAoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIEhlcmVNYXBzQVBJU2VydmljZS5sb2FkTW9kdWxlcygkYXR0cnMuJGF0dHIsIHtcbiAgICAgICAgICAgICAgICAgICAgXCJjb250cm9sc1wiOiBfdWlNb2R1bGVSZWFkeSxcbiAgICAgICAgICAgICAgICAgICAgXCJldmVudHNcIjogX2V2ZW50c01vZHVsZVJlYWR5XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIF9pbml0TWFwKGNiKSB7XG4gICAgICAgICAgICB2YXIgbWFwID0gaGVyZW1hcHMubWFwID0gbmV3IEguTWFwKCRlbGVtZW50WzBdLCBoZXJlbWFwcy5sYXllcnMubm9ybWFsLm1hcCwge1xuICAgICAgICAgICAgICAgIHpvb206IEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmlzVmFsaWRDb29yZHMocG9zaXRpb24pID8gb3B0aW9ucy56b29tIDogb3B0aW9ucy5tYXhab29tLFxuICAgICAgICAgICAgICAgIGNlbnRlcjogbmV3IEguZ2VvLlBvaW50KHBvc2l0aW9uLmxhdGl0dWRlLCBwb3NpdGlvbi5sb25naXR1ZGUpXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLmFkZE1hcmtlcnNUb01hcChtYXAsIHBsYWNlcywgdHJ1ZSk7XG5cbiAgICAgICAgICAgIGlmIChIZXJlTWFwc0NvbmZpZy5tYXBUaWxlQ29uZmlnKVxuICAgICAgICAgICAgICAgIF9zZXRDdXN0b21NYXBTdHlsZXMobWFwLCBIZXJlTWFwc0NvbmZpZy5tYXBUaWxlQ29uZmlnKTtcblxuICAgICAgICAgICAgbWFwUmVhZHkgJiYgbWFwUmVhZHkoTWFwUHJveHkoKSk7XG5cbiAgICAgICAgICAgIGNiICYmIGNiKCk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIF91aU1vZHVsZVJlYWR5KCkge1xuICAgICAgICAgICAgSGVyZU1hcHNVaUZhY3Rvcnkuc3RhcnQoe1xuICAgICAgICAgICAgICAgIHBsYXRmb3JtOiBoZXJlbWFwcyxcbiAgICAgICAgICAgICAgICBhbGlnbm1lbnQ6ICRhdHRycy5jb250cm9sc1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBfZXZlbnRzTW9kdWxlUmVhZHkoKSB7XG4gICAgICAgICAgICBIZXJlTWFwc0V2ZW50c0ZhY3Rvcnkuc3RhcnQoe1xuICAgICAgICAgICAgICAgIHBsYXRmb3JtOiBoZXJlbWFwcyxcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnM6IGxpc3RlbmVycyxcbiAgICAgICAgICAgICAgICBvcHRpb25zOiBvcHRpb25zLFxuICAgICAgICAgICAgICAgIGluamVjdG9yOiBfbW9kdWxlSW5qZWN0b3JcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gX21vZHVsZUluamVjdG9yKCkge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChpZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBoZXJlbWFwc1tpZF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBfcmVzaXplSGFuZGxlcihoZWlnaHQsIHdpZHRoKSB7XG4gICAgICAgICAgICBfc2V0TWFwU2l6ZS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuXG4gICAgICAgICAgICBoZXJlbWFwcy5tYXAuZ2V0Vmlld1BvcnQoKS5yZXNpemUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIF9zZXRNYXBTaXplKGhlaWdodCwgd2lkdGgpIHtcbiAgICAgICAgICAgIHZhciBoZWlnaHQgPSBoZWlnaHQgfHwgJGVsZW1lbnRbMF0ucGFyZW50Tm9kZS5vZmZzZXRIZWlnaHQgfHwgb3B0aW9ucy5oZWlnaHQsXG4gICAgICAgICAgICAgICAgd2lkdGggPSB3aWR0aCB8fCAkZWxlbWVudFswXS5wYXJlbnROb2RlLm9mZnNldFdpZHRoIHx8IG9wdGlvbnMud2lkdGg7XG5cbiAgICAgICAgICAgICRzY29wZS5tYXBIZWlnaHQgPSBoZWlnaHQgKyAncHgnO1xuICAgICAgICAgICAgJHNjb3BlLm1hcFdpZHRoID0gd2lkdGggKyAncHgnO1xuXG4gICAgICAgICAgICBIZXJlTWFwc1V0aWxzU2VydmljZS5ydW5TY29wZURpZ2VzdElmTmVlZCgkc2NvcGUpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmdW5jdGlvbiBfc2V0Q3VzdG9tTWFwU3R5bGVzKG1hcCwgY29uZmlnKSB7XG4gICAgICAgICAgICAvLyBDcmVhdGUgYSBNYXBUaWxlU2VydmljZSBpbnN0YW5jZSB0byByZXF1ZXN0IGJhc2UgdGlsZXMgKGkuZS4gYmFzZS5tYXAuYXBpLmhlcmUuY29tKTpcbiAgICAgICAgICAgIHZhciBtYXBUaWxlU2VydmljZSA9IGhlcmVtYXBzLnBsYXRmb3JtLmdldE1hcFRpbGVTZXJ2aWNlKHsgJ3R5cGUnOiAnYmFzZScgfSk7XG5cbiAgICAgICAgICAgIC8vIENyZWF0ZSBhIHRpbGUgbGF5ZXIgd2hpY2ggcmVxdWVzdHMgbWFwIHRpbGVzXG4gICAgICAgICAgICB2YXIgbmV3U3R5bGVMYXllciA9IG1hcFRpbGVTZXJ2aWNlLmNyZWF0ZVRpbGVMYXllcihcbiAgICAgICAgICAgICAgICAnbWFwdGlsZScsIFxuICAgICAgICAgICAgICAgIGNvbmZpZy5zY2hlbWUgfHwgJ25vcm1hbC5kYXknLCBcbiAgICAgICAgICAgICAgICBjb25maWcuc2l6ZSB8fCAyNTYsIFxuICAgICAgICAgICAgICAgIGNvbmZpZy5mb3JtYXQgfHwgJ3BuZzgnLCBcbiAgICAgICAgICAgICAgICBjb25maWcubWV0YWRhdGFRdWVyeVBhcmFtcyB8fCB7fVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gU2V0IG5ldyBzdHlsZSBsYXllciBhcyBhIGJhc2UgbGF5ZXIgb24gdGhlIG1hcDpcbiAgICAgICAgICAgIG1hcC5zZXRCYXNlTGF5ZXIobmV3U3R5bGVMYXllcik7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBNYXBQcm94eSgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgcmVmcmVzaDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY3VycmVudEJvdW5kcyA9IHRoaXMuZ2V0Vmlld0JvdW5kcygpO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0TWFwU2l6ZXMoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRWaWV3Qm91bmRzKGN1cnJlbnRCb3VuZHMpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0TWFwU2l6ZXM6IGZ1bmN0aW9uIChoZWlnaHQsIHdpZHRoKSB7XG4gICAgICAgICAgICAgICAgICAgIF9yZXNpemVIYW5kbGVyLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBnZXRQbGF0Zm9ybTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGVyZW1hcHM7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBjYWxjdWxhdGVSb3V0ZTogZnVuY3Rpb24gKGRyaXZlVHlwZSwgZGlyZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBIZXJlTWFwc1JvdXRlc1NlcnZpY2UuY2FsY3VsYXRlUm91dGUoaGVyZW1hcHMsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRyaXZlVHlwZTogZHJpdmVUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGlyZWN0aW9uOiBkaXJlY3Rpb25cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBhZGRSb3V0ZVRvTWFwOiBmdW5jdGlvbiAocm91dGVEYXRhLCBjbGVhbikge1xuICAgICAgICAgICAgICAgICAgICBIZXJlTWFwc1JvdXRlc1NlcnZpY2UuYWRkUm91dGVUb01hcChoZXJlbWFwcy5tYXAsIHJvdXRlRGF0YSwgY2xlYW4pO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0Wm9vbTogZnVuY3Rpb24gKHpvb20sIHN0ZXApIHtcbiAgICAgICAgICAgICAgICAgICAgSGVyZU1hcHNVdGlsc1NlcnZpY2Uuem9vbShoZXJlbWFwcy5tYXAsIHpvb20gfHwgMTAsIHN0ZXApO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgZ2V0Wm9vbTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGVyZW1hcHMubWFwLmdldFpvb20oKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGdldENlbnRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGVyZW1hcHMubWFwLmdldENlbnRlcigpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgZ2V0Vmlld0JvdW5kczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGVyZW1hcHMubWFwLmdldFZpZXdCb3VuZHMoKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHNldFZpZXdCb3VuZHM6IGZ1bmN0aW9uIChib3VuZGluZ1JlY3QsIG9wdF9hbmltYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIEhlcmVNYXBzTWFya2VyU2VydmljZS5zZXRWaWV3Qm91bmRzKGhlcmVtYXBzLm1hcCwgYm91bmRpbmdSZWN0LCBvcHRfYW5pbWF0ZSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBnZXRCb3VuZHNSZWN0RnJvbVBvaW50czogZnVuY3Rpb24gKHRvcExlZnQsIGJvdHRvbVJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBIZXJlTWFwc1V0aWxzU2VydmljZS5nZXRCb3VuZHNSZWN0RnJvbVBvaW50cy5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0Q2VudGVyOiBmdW5jdGlvbiAoY29vcmRzLCBvcHRfYW5pbWF0ZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWNvb3Jkcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ2Nvb3JkcyBhcmUgbm90IHNwZWNpZmllZCEnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGhlcmVtYXBzLm1hcC5zZXRDZW50ZXIoY29vcmRzLCBvcHRfYW5pbWF0ZSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBjbGVhblJvdXRlczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBIZXJlTWFwc1JvdXRlc1NlcnZpY2UuY2xlYW5Sb3V0ZXMoaGVyZW1hcHMubWFwKTtcbiAgICAgICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgICAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVIaWdoQWNjdXJhY3lcbiAgICAgICAgICAgICAgICAgKiBAcGFyYW0ge051bWJlcn0gbWF4aW11bUFnZSAtIHRoZSBtYXhpbXVtIGFnZSBpbiBtaWxsaXNlY29uZHMgb2YgYSBwb3NzaWJsZSBjYWNoZWQgcG9zaXRpb24gdGhhdCBpcyBhY2NlcHRhYmxlIHRvIHJldHVybi4gSWYgc2V0IHRvIDAsIGl0IG1lYW5zIHRoYXQgdGhlIGRldmljZSBjYW5ub3QgdXNlIGEgY2FjaGVkIHBvc2l0aW9uIGFuZCBtdXN0IGF0dGVtcHQgdG8gcmV0cmlldmUgdGhlIHJlYWwgY3VycmVudCBwb3NpdGlvblxuICAgICAgICAgICAgICAgICAqIEByZXR1cm4ge1Byb21pc2V9XG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgZ2V0VXNlckxvY2F0aW9uOiBmdW5jdGlvbiAoZW5hYmxlSGlnaEFjY3VyYWN5LCBtYXhpbXVtQWdlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBfZ2V0TG9jYXRpb24uYXBwbHkobnVsbCwgYXJndW1lbnRzKS50aGVuKGZ1bmN0aW9uIChwb3NpdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNvb3JkcyA9IHBvc2l0aW9uLmNvb3JkcztcblxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXQ6IGNvb3Jkcy5sYXRpdHVkZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsbmc6IGNvb3Jkcy5sb25naXR1ZGVcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBnZW9jb2RlUG9zaXRpb246IGZ1bmN0aW9uIChjb29yZHMsIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEhlcmVNYXBzQVBJU2VydmljZS5nZW9jb2RlUG9zaXRpb24oaGVyZW1hcHMucGxhdGZvcm0sIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvb3JkczogY29vcmRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmFkaXVzOiBvcHRpb25zICYmIG9wdGlvbnMucmFkaXVzLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGFuZzogb3B0aW9ucyAmJiBvcHRpb25zLmxhbmdcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBnZW9jb2RlQWRkcmVzczogZnVuY3Rpb24gKGFkZHJlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEhlcmVNYXBzQVBJU2VydmljZS5nZW9jb2RlQWRkcmVzcyhoZXJlbWFwcy5wbGF0Zm9ybSwge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VhcmNodGV4dDogYWRkcmVzcyAmJiBhZGRyZXNzLnNlYXJjaHRleHQsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb3VudHJ5OiBhZGRyZXNzICYmIGFkZHJlc3MuY291bnRyeSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNpdHk6IGFkZHJlc3MgJiYgYWRkcmVzcy5jaXR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RyZWV0OiBhZGRyZXNzICYmIGFkZHJlc3Muc3RyZWV0LFxuICAgICAgICAgICAgICAgICAgICAgICAgaG91c2VudW1iZXI6IGFkZHJlc3MgJiYgYWRkcmVzcy5ob3VzZW51bWJlclxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGdlb2NvZGVBdXRvY29tcGxldGU6IGZ1bmN0aW9uIChxdWVyeSwgb3B0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSGVyZU1hcHNBUElTZXJ2aWNlLmdlb2NvZGVBdXRvY29tcGxldGUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICAgICAgYmVnaW5IaWdobGlnaHQ6IG9wdGlvbnMgJiYgb3B0aW9ucy5iZWdpbkhpZ2hsaWdodCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuZEhpZ2hsaWdodDogb3B0aW9ucyAmJiBvcHRpb25zLmVuZEhpZ2hsaWdodCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heHJlc3VsdHM6IG9wdGlvbnMgJiYgb3B0aW9ucy5tYXhyZXN1bHRzXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgZmluZExvY2F0aW9uQnlJZDogZnVuY3Rpb24gKGxvY2F0aW9uSWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEhlcmVNYXBzQVBJU2VydmljZS5maW5kTG9jYXRpb25CeUlkKGxvY2F0aW9uSWQpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgdXBkYXRlTWFya2VyczogZnVuY3Rpb24gKHBsYWNlcywgcmVmcmVzaFZpZXdib3VuZHMpIHtcbiAgICAgICAgICAgICAgICAgICAgSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLnVwZGF0ZU1hcmtlcnMoaGVyZW1hcHMubWFwLCBwbGFjZXMsIHJlZnJlc2hWaWV3Ym91bmRzKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGdldE1hcEZhY3Rvcnk6IGZ1bmN0aW9uICgpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSGVyZU1hcHNVdGlsc1NlcnZpY2UuZ2V0TWFwRmFjdG9yeSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgfVxufTtcbiIsInJlcXVpcmUoJy4vcHJvdmlkZXJzL21hcmtlcnMnKTtcbnJlcXVpcmUoJy4vcHJvdmlkZXJzL21hcC1tb2R1bGVzJyk7XG5yZXF1aXJlKCcuL3Byb3ZpZGVycy9yb3V0ZXMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBhbmd1bGFyLm1vZHVsZSgnaGVyZW1hcHMnLCBbXG4gICAgJ2hlcmVtYXBzLW1hcmtlcnMtbW9kdWxlJyxcbiAgICAnaGVyZW1hcHMtcm91dGVzLW1vZHVsZScsXG4gICAgJ2hlcmVtYXBzLW1hcC1tb2R1bGVzJ1xuXSlcbiAgICAucHJvdmlkZXIoJ0hlcmVNYXBzQ29uZmlnJywgcmVxdWlyZSgnLi9wcm92aWRlcnMvbWFwY29uZmlnLnByb3ZpZGVyJykpXG4gICAgLnNlcnZpY2UoJ0hlcmVNYXBzVXRpbHNTZXJ2aWNlJywgcmVxdWlyZSgnLi9wcm92aWRlcnMvbWFwdXRpbHMuc2VydmljZScpKVxuICAgIC5zZXJ2aWNlKCdIZXJlTWFwc0FQSVNlcnZpY2UnLCByZXF1aXJlKCcuL3Byb3ZpZGVycy9hcGkuc2VydmljZScpKVxuICAgIC5jb25zdGFudCgnSGVyZU1hcHNDT05TVFMnLCByZXF1aXJlKCcuL3Byb3ZpZGVycy9jb25zdHMnKSlcbiAgICAuZGlyZWN0aXZlKCdoZXJlbWFwcycsIHJlcXVpcmUoJy4vaGVyZW1hcHMuZGlyZWN0aXZlJykpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc0FQSVNlcnZpY2U7XG5cbkhlcmVNYXBzQVBJU2VydmljZS4kaW5qZWN0ID0gW1xuICAgICckcScsXG4gICAgJyRodHRwJyxcbiAgICAnSGVyZU1hcHNDb25maWcnLFxuICAgICdIZXJlTWFwc1V0aWxzU2VydmljZScsXG4gICAgJ0hlcmVNYXBzQ09OU1RTJ1xuXTtcbmZ1bmN0aW9uIEhlcmVNYXBzQVBJU2VydmljZSgkcSwgJGh0dHAsIEhlcmVNYXBzQ29uZmlnLCBIZXJlTWFwc1V0aWxzU2VydmljZSwgSGVyZU1hcHNDT05TVFMpIHtcbiAgICB2YXIgdmVyc2lvbiA9IEhlcmVNYXBzQ29uZmlnLmFwaVZlcnNpb24sXG4gICAgICAgIHByb3RvY29sID0gSGVyZU1hcHNDb25maWcudXNlSFRUUFMgPyAnaHR0cHMnIDogJ2h0dHAnO1xuXG4gICAgdmFyIEFQSV9WRVJTSU9OID0ge1xuICAgICAgICBWOiBwYXJzZUludCh2ZXJzaW9uKSxcbiAgICAgICAgU1VCOiB2ZXJzaW9uXG4gICAgfTtcblxuICAgIHZhciBDT05GSUcgPSB7XG4gICAgICAgIEJBU0U6IFwiOi8vanMuYXBpLmhlcmUuY29tL3ZcIixcbiAgICAgICAgQ09SRTogXCJtYXBzanMtY29yZS5qc1wiLFxuICAgICAgICBTRVJWSUNFOiBcIm1hcHNqcy1zZXJ2aWNlLmpzXCIsXG4gICAgICAgIFVJOiB7XG4gICAgICAgICAgICBzcmM6IFwibWFwc2pzLXVpLmpzXCIsXG4gICAgICAgICAgICBocmVmOiBcIm1hcHNqcy11aS5jc3NcIlxuICAgICAgICB9LFxuICAgICAgICBFVkVOVFM6IFwibWFwc2pzLW1hcGV2ZW50cy5qc1wiLFxuICAgICAgICBBVVRPQ09NUExFVEVfVVJMOiBcIjovL2F1dG9jb21wbGV0ZS5nZW9jb2Rlci5jaXQuYXBpLmhlcmUuY29tLzYuMi9zdWdnZXN0Lmpzb25cIixcbiAgICAgICAgTE9DQVRJT05fVVJMOiBcIjovL2dlb2NvZGVyLmNpdC5hcGkuaGVyZS5jb20vNi4yL2dlb2NvZGUuanNvblwiXG4gICAgfTtcblxuICAgIHZhciBBUElfREVGRVJTUXVldWUgPSB7fTtcblxuICAgIEFQSV9ERUZFUlNRdWV1ZVtDT05GSUcuQ09SRV0gPSBbXTtcbiAgICBBUElfREVGRVJTUXVldWVbQ09ORklHLlNFUlZJQ0VdID0gW107XG4gICAgQVBJX0RFRkVSU1F1ZXVlW0NPTkZJRy5VSS5zcmNdID0gW107XG4gICAgQVBJX0RFRkVSU1F1ZXVlW0NPTkZJRy5QQU5PXSA9IFtdO1xuICAgIEFQSV9ERUZFUlNRdWV1ZVtDT05GSUcuRVZFTlRTXSA9IFtdO1xuXG4gICAgdmFyIGhlYWQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaGVhZCcpWzBdO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbG9hZEFwaTogbG9hZEFwaSxcbiAgICAgICAgbG9hZE1vZHVsZXM6IGxvYWRNb2R1bGVzLFxuICAgICAgICBnZXRQb3NpdGlvbjogZ2V0UG9zaXRpb24sXG4gICAgICAgIGdlb2NvZGVQb3NpdGlvbjogZ2VvY29kZVBvc2l0aW9uLFxuICAgICAgICBnZW9jb2RlQWRkcmVzczogZ2VvY29kZUFkZHJlc3MsXG4gICAgICAgIGdlb2NvZGVBdXRvY29tcGxldGU6IGdlb2NvZGVBdXRvY29tcGxldGUsXG4gICAgICAgIGZpbmRMb2NhdGlvbkJ5SWQ6IGZpbmRMb2NhdGlvbkJ5SWRcbiAgICB9O1xuXG4gICAgLy8jcmVnaW9uIFBVQkxJQ1xuICAgIGZ1bmN0aW9uIGxvYWRBcGkoKSB7XG4gICAgICAgIHJldHVybiBfZ2V0TG9hZGVyKENPTkZJRy5DT1JFKVxuICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBfZ2V0TG9hZGVyKENPTkZJRy5TRVJWSUNFKTtcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxvYWRNb2R1bGVzKGF0dHJzLCBoYW5kbGVycykge1xuICAgICAgICBmb3IgKHZhciBrZXkgaW4gaGFuZGxlcnMpIHtcbiAgICAgICAgICAgIGlmICghaGFuZGxlcnMuaGFzT3duUHJvcGVydHkoa2V5KSB8fCAhYXR0cnNba2V5XSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgdmFyIGxvYWRlciA9IF9nZXRMb2FkZXJCeUF0dHIoa2V5KTtcblxuICAgICAgICAgICAgbG9hZGVyKClcbiAgICAgICAgICAgICAgICAudGhlbihoYW5kbGVyc1trZXldKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFBvc2l0aW9uKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAob3B0aW9ucyAmJiBIZXJlTWFwc1V0aWxzU2VydmljZS5pc1ZhbGlkQ29vcmRzKG9wdGlvbnMuY29vcmRzKSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh7IGNvb3Jkczogb3B0aW9ucy5jb29yZHMgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuYXZpZ2F0b3IuZ2VvbG9jYXRpb24uZ2V0Q3VycmVudFBvc2l0aW9uKGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0sIG9wdGlvbnMpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2VvY29kZVBvc2l0aW9uKHBsYXRmb3JtLCBwYXJhbXMpIHtcbiAgICAgICAgaWYgKCFwYXJhbXMuY29vcmRzKVxuICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ01pc3NlZCByZXF1aXJlZCBjb29yZHMnKTtcblxuICAgICAgICB2YXIgZ2VvY29kZXIgPSBwbGF0Zm9ybS5nZXRHZW9jb2RpbmdTZXJ2aWNlKCksXG4gICAgICAgICAgICBkZWZlcnJlZCA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgICBfcGFyYW1zID0ge1xuICAgICAgICAgICAgICAgIHByb3g6IFtwYXJhbXMuY29vcmRzLmxhdCwgcGFyYW1zLmNvb3Jkcy5sbmcsIHBhcmFtcy5yYWRpdXMgfHwgMjUwXS5qb2luKCcsJyksXG4gICAgICAgICAgICAgICAgbW9kZTogJ3JldHJpZXZlQWRkcmVzc2VzJyxcbiAgICAgICAgICAgICAgICBtYXhyZXN1bHRzOiAnMScsXG4gICAgICAgICAgICAgICAgZ2VuOiAnOCcsXG4gICAgICAgICAgICAgICAgbGFuZ3VhZ2U6IHBhcmFtcy5sYW5nIHx8ICdlbi1nYidcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgZ2VvY29kZXIucmV2ZXJzZUdlb2NvZGUoX3BhcmFtcywgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3BvbnNlKVxuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcilcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZW9jb2RlQWRkcmVzcyhwbGF0Zm9ybSwgcGFyYW1zKSB7XG4gICAgICAgIGlmICghcGFyYW1zKVxuICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ01pc3NlZCByZXF1aXJlZCBwYXJhbWV0ZXJzJyk7XG5cbiAgICAgICAgdmFyIGdlb2NvZGVyID0gcGxhdGZvcm0uZ2V0R2VvY29kaW5nU2VydmljZSgpLFxuICAgICAgICAgICAgZGVmZXJyZWQgPSAkcS5kZWZlcigpLFxuICAgICAgICAgICAgX3BhcmFtcyA9IHsgZ2VuOiA4IH07XG5cbiAgICAgICAgZm9yICh2YXIga2V5IGluIHBhcmFtcykgeyBfcGFyYW1zW2tleV0gPSBwYXJhbXNba2V5XTsgfVxuXG4gICAgICAgIGdlb2NvZGVyLmdlb2NvZGUoX3BhcmFtcywgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3BvbnNlKVxuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcilcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2VvY29kZUF1dG9jb21wbGV0ZShwYXJhbXMpIHtcbiAgICAgICAgaWYgKCFwYXJhbXMpXG4gICAgICAgICAgICByZXR1cm4gY29uc29sZS5lcnJvcignTWlzc2luZyByZXF1aXJlZCBwYXJhbWV0ZXJzJyk7XG5cbiAgICAgICAgdmFyIGF1dG9jb21wbGV0ZVVybCA9IHByb3RvY29sICsgQ09ORklHLkFVVE9DT01QTEVURV9VUkwsXG4gICAgICAgICAgICBkZWZlcnJlZCA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgICBfcGFyYW1zID0ge1xuICAgICAgICAgICAgICAgIHF1ZXJ5OiBcIlwiLFxuICAgICAgICAgICAgICAgIGJlZ2luSGlnaGxpZ2h0OiBcIjxtYXJrPlwiLFxuICAgICAgICAgICAgICAgIGVuZEhpZ2hsaWdodDogXCI8L21hcms+XCIsXG4gICAgICAgICAgICAgICAgbWF4cmVzdWx0czogXCI1XCJcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgZm9yICh2YXIga2V5IGluIF9wYXJhbXMpIHtcbiAgICAgICAgICAgIGlmIChhbmd1bGFyLmlzRGVmaW5lZChwYXJhbXNba2V5XSkpIHtcbiAgICAgICAgICAgICAgICBfcGFyYW1zW2tleV0gPSBwYXJhbXNba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIF9wYXJhbXMuYXBwX2lkID0gSGVyZU1hcHNDb25maWcuYXBwX2lkO1xuICAgICAgICBfcGFyYW1zLmFwcF9jb2RlID0gSGVyZU1hcHNDb25maWcuYXBwX2NvZGU7XG4gICAgICAgIF9wYXJhbXMuYXBpS2V5ID0gSGVyZU1hcHNDb25maWcuYXBpS2V5O1xuXG4gICAgICAgICRodHRwLmdldChhdXRvY29tcGxldGVVcmwsIHsgcGFyYW1zOiBfcGFyYW1zIH0pXG4gICAgICAgICAgICAuc3VjY2VzcyhmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5lcnJvcihmdW5jdGlvbihlcnJvcikge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaW5kcyBsb2NhdGlvbiBieSBIRVJFIE1hcHMgTG9jYXRpb24gaWRlbnRpZmllci5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBmaW5kTG9jYXRpb25CeUlkKGxvY2F0aW9uSWQpIHtcbiAgICAgICAgaWYgKCFsb2NhdGlvbklkKVxuICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgTG9jYXRpb24gSWRlbnRpZmllcicpO1xuXG4gICAgICAgIHZhciBsb2NhdGlvblVybCA9IHByb3RvY29sICsgQ09ORklHLkxPQ0FUSU9OX1VSTCxcbiAgICAgICAgICAgIGRlZmVycmVkID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICAgIF9wYXJhbXMgPSB7XG4gICAgICAgICAgICAgICAgbG9jYXRpb25pZDogbG9jYXRpb25JZCxcbiAgICAgICAgICAgICAgICBnZW46IDksXG4gICAgICAgICAgICAgICAgYXBwX2lkOiBIZXJlTWFwc0NvbmZpZy5hcHBfaWQsXG4gICAgICAgICAgICAgICAgYXBwX2NvZGU6IEhlcmVNYXBzQ29uZmlnLmFwcF9jb2RlLFxuICAgICAgICAgICAgICAgIGFwaUtleTogSGVyZU1hcHNDb25maWcuYXBpS2V5XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICRodHRwLmdldChsb2NhdGlvblVybCwgeyBwYXJhbXM6IF9wYXJhbXMgfSlcbiAgICAgICAgICAgIC5zdWNjZXNzKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmVycm9yKGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cblxuICAgIC8vI2VuZHJlZ2lvbiBQVUJMSUNcblxuICAgIGZ1bmN0aW9uIF9nZXRMb2FkZXJCeUF0dHIoYXR0cikge1xuICAgICAgICB2YXIgbG9hZGVyO1xuXG4gICAgICAgIHN3aXRjaCAoYXR0cikge1xuICAgICAgICAgICAgY2FzZSBIZXJlTWFwc0NPTlNUUy5NT0RVTEVTLlVJOlxuICAgICAgICAgICAgICAgIGxvYWRlciA9IF9sb2FkVUlNb2R1bGU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIEhlcmVNYXBzQ09OU1RTLk1PRFVMRVMuRVZFTlRTOlxuICAgICAgICAgICAgICAgIGxvYWRlciA9IF9sb2FkRXZlbnRzTW9kdWxlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gbW9kdWxlJywgYXR0cik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbG9hZGVyO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9sb2FkVUlNb2R1bGUoKSB7XG4gICAgICAgIGlmICghX2lzTG9hZGVkKENPTkZJRy5VSS5zcmMpKSB7XG4gICAgICAgICAgICB2YXIgbGluayA9IEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmNyZWF0ZUxpbmtUYWcoe1xuICAgICAgICAgICAgICAgIHJlbDogJ3N0eWxlc2hlZXQnLFxuICAgICAgICAgICAgICAgIHR5cGU6ICd0ZXh0L2NzcycsXG4gICAgICAgICAgICAgICAgaHJlZjogX2dldFVSTChDT05GSUcuVUkuaHJlZilcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBsaW5rICYmIGhlYWQuYXBwZW5kQ2hpbGQobGluayk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gX2dldExvYWRlcihDT05GSUcuVUkuc3JjKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfbG9hZEV2ZW50c01vZHVsZSgpIHtcbiAgICAgICAgcmV0dXJuIF9nZXRMb2FkZXIoQ09ORklHLkVWRU5UUyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHNvdXJjZU5hbWVcbiAgICAgKiByZXR1cm4ge1N0cmluZ30gZS5nIGh0dHA6Ly9qcy5hcGkuaGVyZS5jb20vdntWRVJ9L3tTVUJWRVJTSU9OfS97U09VUkNFfVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIF9nZXRVUkwoc291cmNlTmFtZSkge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgcHJvdG9jb2wsXG4gICAgICAgICAgICBDT05GSUcuQkFTRSxcbiAgICAgICAgICAgIEFQSV9WRVJTSU9OLlYsXG4gICAgICAgICAgICBcIi9cIixcbiAgICAgICAgICAgIEFQSV9WRVJTSU9OLlNVQixcbiAgICAgICAgICAgIFwiL1wiLFxuICAgICAgICAgICAgc291cmNlTmFtZVxuICAgICAgICBdLmpvaW4oXCJcIik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2dldExvYWRlcihzb3VyY2VOYW1lKSB7XG4gICAgICAgIHZhciBkZWZlciA9ICRxLmRlZmVyKCksIHNyYywgc2NyaXB0O1xuXG4gICAgICAgIGlmIChfaXNMb2FkZWQoc291cmNlTmFtZSkpIHtcbiAgICAgICAgICAgIGRlZmVyLnJlc29sdmUoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNyYyA9IF9nZXRVUkwoc291cmNlTmFtZSk7XG4gICAgICAgICAgICBzY3JpcHQgPSBIZXJlTWFwc1V0aWxzU2VydmljZS5jcmVhdGVTY3JpcHRUYWcoeyBzcmM6IHNyYyB9KTtcblxuICAgICAgICAgICAgc2NyaXB0ICYmIGhlYWQuYXBwZW5kQ2hpbGQoc2NyaXB0KTtcblxuICAgICAgICAgICAgQVBJX0RFRkVSU1F1ZXVlW3NvdXJjZU5hbWVdLnB1c2goZGVmZXIpO1xuXG4gICAgICAgICAgICBzY3JpcHQub25sb2FkID0gX29uTG9hZC5iaW5kKG51bGwsIHNvdXJjZU5hbWUpO1xuICAgICAgICAgICAgc2NyaXB0Lm9uZXJyb3IgPSBfb25FcnJvci5iaW5kKG51bGwsIHNvdXJjZU5hbWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2lzTG9hZGVkKHNvdXJjZU5hbWUpIHtcbiAgICAgICAgdmFyIGNoZWNrZXIgPSBudWxsO1xuXG4gICAgICAgIHN3aXRjaCAoc291cmNlTmFtZSkge1xuICAgICAgICAgICAgY2FzZSBDT05GSUcuQ09SRTpcbiAgICAgICAgICAgICAgICBjaGVja2VyID0gX2lzQ29yZUxvYWRlZDtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgQ09ORklHLlNFUlZJQ0U6XG4gICAgICAgICAgICAgICAgY2hlY2tlciA9IF9pc1NlcnZpY2VMb2FkZWQ7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIENPTkZJRy5VSS5zcmM6XG4gICAgICAgICAgICAgICAgY2hlY2tlciA9IF9pc1VJTG9hZGVkO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBDT05GSUcuRVZFTlRTOlxuICAgICAgICAgICAgICAgIGNoZWNrZXIgPSBfaXNFdmVudHNMb2FkZWQ7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGNoZWNrZXIgPSBmdW5jdGlvbiAoKSB7IHJldHVybiBmYWxzZSB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNoZWNrZXIoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfaXNDb3JlTG9hZGVkKCkge1xuICAgICAgICByZXR1cm4gISF3aW5kb3cuSDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfaXNTZXJ2aWNlTG9hZGVkKCkge1xuICAgICAgICByZXR1cm4gISEod2luZG93LkggJiYgd2luZG93Lkguc2VydmljZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2lzVUlMb2FkZWQoKSB7XG4gICAgICAgIHJldHVybiAhISh3aW5kb3cuSCAmJiB3aW5kb3cuSC51aSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2lzRXZlbnRzTG9hZGVkKCkge1xuICAgICAgICByZXR1cm4gISEod2luZG93LkggJiYgd2luZG93LkgubWFwZXZlbnRzKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfb25Mb2FkKHNvdXJjZU5hbWUpIHtcbiAgICAgICAgdmFyIGRlZmVyUXVldWUgPSBBUElfREVGRVJTUXVldWVbc291cmNlTmFtZV07XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gZGVmZXJRdWV1ZS5sZW5ndGg7IGkgPCBsOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBkZWZlciA9IGRlZmVyUXVldWVbaV07XG4gICAgICAgICAgICBkZWZlci5yZXNvbHZlKCk7XG4gICAgICAgIH1cblxuICAgICAgICBBUElfREVGRVJTUXVldWVbc291cmNlTmFtZV0gPSBbXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfb25FcnJvcihzb3VyY2VOYW1lKSB7XG4gICAgICAgIHZhciBkZWZlclF1ZXVlID0gQVBJX0RFRkVSU1F1ZXVlW3NvdXJjZU5hbWVdO1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgbCA9IGRlZmVyUXVldWUubGVuZ3RoOyBpIDwgbDsgKytpKSB7XG4gICAgICAgICAgICB2YXIgZGVmZXIgPSBkZWZlclF1ZXVlW2ldO1xuICAgICAgICAgICAgZGVmZXIucmVqZWN0KCk7XG4gICAgICAgIH1cblxuICAgICAgICBBUElfREVGRVJTUXVldWVbc291cmNlTmFtZV0gPSBbXTtcbiAgICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgVVBEQVRFX01BUF9SRVNJWkVfVElNRU9VVDogNTAwLFxuICAgIEFOSU1BVElPTl9aT09NX1NURVA6IC4wNSxcbiAgICBNT0RVTEVTOiB7XG4gICAgICAgIFVJOiAnY29udHJvbHMnLFxuICAgICAgICBFVkVOVFM6ICdldmVudHMnLFxuICAgICAgICBQQU5POiAncGFubydcbiAgICB9LFxuICAgIERFRkFVTFRfTUFQX09QVElPTlM6IHtcbiAgICAgICAgaGVpZ2h0OiA0ODAsXG4gICAgICAgIHdpZHRoOiA2NDAsXG4gICAgICAgIHpvb206IDEyLFxuICAgICAgICBtYXhab29tOiAyLFxuICAgICAgICByZXNpemU6IGZhbHNlLFxuICAgICAgICBkcmFnZ2FibGU6IGZhbHNlLFxuICAgICAgICBjb29yZHM6IHtcbiAgICAgICAgICAgIGxvbmdpdHVkZTogMCxcbiAgICAgICAgICAgIGxhdGl0dWRlOiAwXG4gICAgICAgIH1cbiAgICB9LFxuICAgIE1BUktFUl9UWVBFUzoge1xuICAgICAgICBET006IFwiRE9NXCIsXG4gICAgICAgIFNWRzogXCJTVkdcIlxuICAgIH0sXG4gICAgQ09OVFJPTFM6IHtcbiAgICAgICAgTkFNRVM6IHtcbiAgICAgICAgICAgIFNDQUxFOiAnc2NhbGViYXInLFxuICAgICAgICAgICAgU0VUVElOR1M6ICdtYXBzZXR0aW5ncycsXG4gICAgICAgICAgICBaT09NOiAnem9vbScsXG4gICAgICAgICAgICBVU0VSOiAndXNlcnBvc2l0aW9uJ1xuICAgICAgICB9LFxuICAgICAgICBQT1NJVElPTlM6IFtcbiAgICAgICAgICAgICd0b3AtcmlnaHQnLFxuICAgICAgICAgICAgJ3RvcC1jZW50ZXInLFxuICAgICAgICAgICAgJ3RvcC1sZWZ0JyxcbiAgICAgICAgICAgICdsZWZ0LXRvcCcsXG4gICAgICAgICAgICAnbGVmdC1taWRkbGUnLFxuICAgICAgICAgICAgJ2xlZnQtYm90dG9tJyxcbiAgICAgICAgICAgICdyaWdodC10b3AnLFxuICAgICAgICAgICAgJ3JpZ2h0LW1pZGRsZScsXG4gICAgICAgICAgICAncmlnaHQtYm90dG9tJyxcbiAgICAgICAgICAgICdib3R0b20tcmlnaHQnLFxuICAgICAgICAgICAgJ2JvdHRvbS1jZW50ZXInLFxuICAgICAgICAgICAgJ2JvdHRvbS1sZWZ0J1xuICAgICAgICBdXG4gICAgfSxcbiAgICBJTkZPQlVCQkxFOiB7XG4gICAgICAgIFNUQVRFOiB7XG4gICAgICAgICAgICBPUEVOOiAnb3BlbicsXG4gICAgICAgICAgICBDTE9TRUQ6ICdjbG9zZWQnXG4gICAgICAgIH0sXG4gICAgICAgIERJU1BMQVlfRVZFTlQ6IHtcbiAgICAgICAgICAgIHBvaW50ZXJtb3ZlOiAnb25Ib3ZlcicsXG4gICAgICAgICAgICB0YXA6ICdvbkNsaWNrJ1xuICAgICAgICB9XG4gICAgfSxcbiAgICBVU0VSX0VWRU5UUzoge1xuICAgICAgICB0YXA6ICdjbGljaycsXG4gICAgICAgIHBvaW50ZXJtb3ZlOiAnbW91c2Vtb3ZlJyxcbiAgICAgICAgcG9pbnRlcmxlYXZlOiAnbW91c2VsZWF2ZScsXG4gICAgICAgIHBvaW50ZXJlbnRlcjogJ21vdXNlZW50ZXInLFxuICAgICAgICBkcmFnOiAnZHJhZycsXG4gICAgICAgIGRyYWdzdGFydDogJ2RyYWdzdGFydCcsXG4gICAgICAgIGRyYWdlbmQ6ICdkcmFnZW5kJyxcbiAgICAgICAgbWFwdmlld2NoYW5nZTogJ21hcHZpZXdjaGFuZ2UnLFxuICAgICAgICBtYXB2aWV3Y2hhbmdlc3RhcnQ6ICdtYXB2aWV3Y2hhbmdlc3RhcnQnLFxuICAgICAgICBtYXB2aWV3Y2hhbmdlZW5kOiAnbWFwdmlld2NoYW5nZWVuZCdcbiAgICB9XG59IiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc0V2ZW50c0ZhY3Rvcnk7XG5cbkhlcmVNYXBzRXZlbnRzRmFjdG9yeS4kaW5qZWN0ID0gW1xuICAgICdIZXJlTWFwc1V0aWxzU2VydmljZScsXG4gICAgJ0hlcmVNYXBzTWFya2VyU2VydmljZScsXG4gICAgJ0hlcmVNYXBzQ09OU1RTJyxcbiAgICAnSGVyZU1hcHNJbmZvQnViYmxlRmFjdG9yeSdcbl07XG5mdW5jdGlvbiBIZXJlTWFwc0V2ZW50c0ZhY3RvcnkoSGVyZU1hcHNVdGlsc1NlcnZpY2UsIEhlcmVNYXBzTWFya2VyU2VydmljZSwgSGVyZU1hcHNDT05TVFMsIEhlcmVNYXBzSW5mb0J1YmJsZUZhY3RvcnkpIHtcbiAgICBmdW5jdGlvbiBFdmVudHMocGxhdGZvcm0sIEluamVjdG9yLCBsaXN0ZW5lcnMpIHtcbiAgICAgICAgdGhpcy5tYXAgPSBwbGF0Zm9ybS5tYXA7XG4gICAgICAgIHRoaXMubGlzdGVuZXJzID0gbGlzdGVuZXJzO1xuICAgICAgICB0aGlzLmluamVjdCA9IG5ldyBJbmplY3RvcigpO1xuICAgICAgICB0aGlzLmV2ZW50cyA9IHBsYXRmb3JtLmV2ZW50cyA9IG5ldyBILm1hcGV2ZW50cy5NYXBFdmVudHModGhpcy5tYXApO1xuICAgICAgICB0aGlzLmJlaGF2aW9yID0gcGxhdGZvcm0uYmVoYXZpb3IgPSBuZXcgSC5tYXBldmVudHMuQmVoYXZpb3IodGhpcy5ldmVudHMpO1xuICAgICAgICB0aGlzLmJ1YmJsZSA9IEhlcmVNYXBzSW5mb0J1YmJsZUZhY3RvcnkuY3JlYXRlKCk7XG5cbiAgICAgICAgdGhpcy5zZXR1cEV2ZW50TGlzdGVuZXJzKCk7XG4gICAgfVxuXG4gICAgdmFyIHByb3RvID0gRXZlbnRzLnByb3RvdHlwZTtcblxuICAgIHByb3RvLnNldHVwRXZlbnRMaXN0ZW5lcnMgPSBzZXR1cEV2ZW50TGlzdGVuZXJzO1xuICAgIHByb3RvLnNldHVwT3B0aW9ucyA9IHNldHVwT3B0aW9ucztcbiAgICBwcm90by50cmlnZ2VyVXNlckxpc3RlbmVyID0gdHJpZ2dlclVzZXJMaXN0ZW5lcjtcbiAgICBwcm90by5pbmZvQnViYmxlSGFuZGxlciA9IGluZm9CdWJibGVIYW5kbGVyOyAgXG5cbiAgICByZXR1cm4ge1xuICAgICAgICBzdGFydDogZnVuY3Rpb24oYXJncykge1xuICAgICAgICAgICAgaWYgKCEoYXJncy5wbGF0Zm9ybS5tYXAgaW5zdGFuY2VvZiBILk1hcCkpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ01pc3NlZCByZXF1aXJlZCBtYXAgaW5zdGFuY2UnKTtcblxuICAgICAgICAgICAgdmFyIGV2ZW50cyA9IG5ldyBFdmVudHMoYXJncy5wbGF0Zm9ybSwgYXJncy5pbmplY3RvciwgYXJncy5saXN0ZW5lcnMpO1xuXG4gICAgICAgICAgICBhcmdzLm9wdGlvbnMgJiYgZXZlbnRzLnNldHVwT3B0aW9ucyhhcmdzLm9wdGlvbnMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0dXBFdmVudExpc3RlbmVycygpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5tYXAsICd0YXAnLCB0aGlzLmluZm9CdWJibGVIYW5kbGVyLmJpbmQodGhpcykpO1xuXG4gICAgICAgIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5tYXAsICdwb2ludGVybW92ZScsIHRoaXMuaW5mb0J1YmJsZUhhbmRsZXIuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgSGVyZU1hcHNVdGlsc1NlcnZpY2UuYWRkRXZlbnRMaXN0ZW5lcih0aGlzLm1hcCwgJ2RyYWdzdGFydCcsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIGlmIChIZXJlTWFwc01hcmtlclNlcnZpY2UuaXNNYXJrZXJJbnN0YW5jZShlLnRhcmdldCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmJlaGF2aW9yLmRpc2FibGUoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc2VsZi50cmlnZ2VyVXNlckxpc3RlbmVyKEhlcmVNYXBzQ09OU1RTLlVTRVJfRVZFTlRTW2UudHlwZV0sIGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICBIZXJlTWFwc1V0aWxzU2VydmljZS5hZGRFdmVudExpc3RlbmVyKHRoaXMubWFwLCAnZHJhZycsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHZhciBwb2ludGVyID0gZS5jdXJyZW50UG9pbnRlcixcbiAgICAgICAgICAgICAgICB0YXJnZXQgPSBlLnRhcmdldDtcblxuICAgICAgICAgICAgaWYgKEhlcmVNYXBzTWFya2VyU2VydmljZS5pc01hcmtlckluc3RhbmNlKHRhcmdldCkpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXQuc2V0UG9zaXRpb24oc2VsZi5tYXAuc2NyZWVuVG9HZW8ocG9pbnRlci52aWV3cG9ydFgsIHBvaW50ZXIudmlld3BvcnRZKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNlbGYudHJpZ2dlclVzZXJMaXN0ZW5lcihIZXJlTWFwc0NPTlNUUy5VU0VSX0VWRU5UU1tlLnR5cGVdLCBlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgSGVyZU1hcHNVdGlsc1NlcnZpY2UuYWRkRXZlbnRMaXN0ZW5lcih0aGlzLm1hcCwgJ2RyYWdlbmQnLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBpZiAoSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLmlzTWFya2VySW5zdGFuY2UoZS50YXJnZXQpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5iZWhhdmlvci5lbmFibGUoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc2VsZi50cmlnZ2VyVXNlckxpc3RlbmVyKEhlcmVNYXBzQ09OU1RTLlVTRVJfRVZFTlRTW2UudHlwZV0sIGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICBIZXJlTWFwc1V0aWxzU2VydmljZS5hZGRFdmVudExpc3RlbmVyKHRoaXMubWFwLCAnbWFwdmlld2NoYW5nZXN0YXJ0JywgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgc2VsZi50cmlnZ2VyVXNlckxpc3RlbmVyKEhlcmVNYXBzQ09OU1RTLlVTRVJfRVZFTlRTW2UudHlwZV0sIGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICBIZXJlTWFwc1V0aWxzU2VydmljZS5hZGRFdmVudExpc3RlbmVyKHRoaXMubWFwLCAnbWFwdmlld2NoYW5nZScsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHNlbGYudHJpZ2dlclVzZXJMaXN0ZW5lcihIZXJlTWFwc0NPTlNUUy5VU0VSX0VWRU5UU1tlLnR5cGVdLCBlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgSGVyZU1hcHNVdGlsc1NlcnZpY2UuYWRkRXZlbnRMaXN0ZW5lcih0aGlzLm1hcCwgJ21hcHZpZXdjaGFuZ2VlbmQnLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBzZWxmLnRyaWdnZXJVc2VyTGlzdGVuZXIoSGVyZU1hcHNDT05TVFMuVVNFUl9FVkVOVFNbZS50eXBlXSwgZSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldHVwT3B0aW9ucyhvcHRpb25zKSB7XG4gICAgICAgIGlmICghb3B0aW9ucylcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLm1hcC5kcmFnZ2FibGUgPSAhIW9wdGlvbnMuZHJhZ2dhYmxlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRyaWdnZXJVc2VyTGlzdGVuZXIoZXZlbnROYW1lLCBlKSB7XG4gICAgICAgIGlmICghdGhpcy5saXN0ZW5lcnMpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIGNhbGxiYWNrID0gdGhpcy5saXN0ZW5lcnNbZXZlbnROYW1lXTtcblxuICAgICAgICBjYWxsYmFjayAmJiBjYWxsYmFjayhlKTtcbiAgICB9XG4gICAgXG4gICAgZnVuY3Rpb24gaW5mb0J1YmJsZUhhbmRsZXIoZSl7XG4gICAgICAgIHZhciB1aSA9IHRoaXMuaW5qZWN0KCd1aScpO1xuICAgICAgICBcbiAgICAgICAgaWYodWkpXG4gICAgICAgICAgICB0aGlzLmJ1YmJsZS50b2dnbGUoZSwgdWkpO1xuICAgICAgICAgICAgXG4gICAgICAgIHRoaXMudHJpZ2dlclVzZXJMaXN0ZW5lcihIZXJlTWFwc0NPTlNUUy5VU0VSX0VWRU5UU1tlLnR5cGVdLCBlKTsgICAgICBcbiAgICB9XG5cbn07IiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc0luZm9CdWJibGVGYWN0b3J5O1xuXG5IZXJlTWFwc0luZm9CdWJibGVGYWN0b3J5LiRpbmplY3QgPSBbXG4gICAgJ0hlcmVNYXBzTWFya2VyU2VydmljZScsXG4gICAgJ0hlcmVNYXBzVXRpbHNTZXJ2aWNlJyxcbiAgICAnSGVyZU1hcHNDT05TVFMnXG5dO1xuZnVuY3Rpb24gSGVyZU1hcHNJbmZvQnViYmxlRmFjdG9yeShIZXJlTWFwc01hcmtlclNlcnZpY2UsIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLCBIZXJlTWFwc0NPTlNUUykge1xuICAgIGZ1bmN0aW9uIEluZm9CdWJibGUoKSB7fVxuXG4gICAgdmFyIHByb3RvID0gSW5mb0J1YmJsZS5wcm90b3R5cGU7XG4gICAgICAgIFxuICAgIHByb3RvLmNyZWF0ZSA9IGNyZWF0ZTtcbiAgICBwcm90by51cGRhdGUgPSB1cGRhdGU7XG4gICAgcHJvdG8udG9nZ2xlID0gdG9nZ2xlO1xuICAgIHByb3RvLnNob3cgPSBzaG93O1xuICAgIHByb3RvLmNsb3NlID0gY2xvc2U7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBjcmVhdGU6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEluZm9CdWJibGUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRvZ2dsZShlLCB1aSkge1xuICAgICAgICBpZiAoSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLmlzTWFya2VySW5zdGFuY2UoZS50YXJnZXQpKVxuICAgICAgICAgICAgdGhpcy5zaG93KGUsIHVpKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy5jbG9zZShlLCB1aSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdXBkYXRlKGJ1YmJsZSwgZGF0YSkge1xuICAgICAgICBidWJibGUuZGlzcGxheSA9IGRhdGEuZGlzcGxheTtcblxuICAgICAgICBidWJibGUuc2V0UG9zaXRpb24oZGF0YS5wb3NpdGlvbik7XG4gICAgICAgIGJ1YmJsZS5zZXRDb250ZW50KGRhdGEubWFya3VwKTtcblxuICAgICAgICBidWJibGUuc2V0U3RhdGUoSGVyZU1hcHNDT05TVFMuSU5GT0JVQkJMRS5TVEFURS5PUEVOKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGUoc291cmNlKSB7XG4gICAgICAgIHZhciBidWJibGUgPSBuZXcgSC51aS5JbmZvQnViYmxlKHNvdXJjZS5wb3NpdGlvbiwge1xuICAgICAgICAgICAgY29udGVudDogc291cmNlLm1hcmt1cFxuICAgICAgICB9KTtcblxuICAgICAgICBidWJibGUuZGlzcGxheSA9IHNvdXJjZS5kaXNwbGF5O1xuICAgICAgICBidWJibGUuYWRkQ2xhc3MoSGVyZU1hcHNDT05TVFMuSU5GT0JVQkJMRS5TVEFURS5PUEVOKVxuXG4gICAgICAgIEhlcmVNYXBzVXRpbHNTZXJ2aWNlLmFkZEV2ZW50TGlzdGVuZXIoYnViYmxlLCAnc3RhdGVjaGFuZ2UnLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICB2YXIgc3RhdGUgPSB0aGlzLmdldFN0YXRlKCksXG4gICAgICAgICAgICAgICAgZWwgPSB0aGlzLmdldEVsZW1lbnQoKTtcbiAgICAgICAgICAgIGlmIChzdGF0ZSA9PT0gSGVyZU1hcHNDT05TVFMuSU5GT0JVQkJMRS5TVEFURS5DTE9TRUQpIHtcbiAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKEhlcmVNYXBzQ09OU1RTLklORk9CVUJCTEUuU1RBVEUuT1BFTik7XG4gICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLmFkZENsYXNzKHN0YXRlKVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gYnViYmxlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNob3coZSwgdWksIGRhdGEpIHtcbiAgICAgICAgdmFyIHRhcmdldCA9IGUudGFyZ2V0LFxuICAgICAgICAgICAgZGF0YSA9IHRhcmdldC5nZXREYXRhKCksXG4gICAgICAgICAgICBlbCA9IG51bGw7XG5cbiAgICAgICAgaWYgKCFkYXRhIHx8ICFkYXRhLmRpc3BsYXkgfHwgIWRhdGEubWFya3VwIHx8IGRhdGEuZGlzcGxheSAhPT0gSGVyZU1hcHNDT05TVFMuSU5GT0JVQkJMRS5ESVNQTEFZX0VWRU5UW2UudHlwZV0pXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHNvdXJjZSA9IHtcbiAgICAgICAgICAgIHBvc2l0aW9uOiB0YXJnZXQuZ2V0UG9zaXRpb24oKSxcbiAgICAgICAgICAgIG1hcmt1cDogZGF0YS5tYXJrdXAsXG4gICAgICAgICAgICBkaXNwbGF5OiBkYXRhLmRpc3BsYXlcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoIXVpLmJ1YmJsZSkge1xuICAgICAgICAgICAgdWkuYnViYmxlID0gdGhpcy5jcmVhdGUoc291cmNlKTtcbiAgICAgICAgICAgIHVpLmFkZEJ1YmJsZSh1aS5idWJibGUpO1xuXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnVwZGF0ZSh1aS5idWJibGUsIHNvdXJjZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xvc2UoZSwgdWkpIHtcbiAgICAgICAgaWYgKCF1aS5idWJibGUgfHwgdWkuYnViYmxlLmRpc3BsYXkgIT09IEhlcmVNYXBzQ09OU1RTLklORk9CVUJCTEUuRElTUExBWV9FVkVOVFtlLnR5cGVdKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB1aS5idWJibGUuc2V0U3RhdGUoSGVyZU1hcHNDT05TVFMuSU5GT0JVQkJMRS5TVEFURS5DTE9TRUQpO1xuICAgIH1cbn0iLCJhbmd1bGFyLm1vZHVsZSgnaGVyZW1hcHMtZXZlbnRzLW1vZHVsZScsIFtdKVxuICAgIC5mYWN0b3J5KCdIZXJlTWFwc0V2ZW50c0ZhY3RvcnknLCByZXF1aXJlKCcuL2V2ZW50cy9ldmVudHMuanMnKSlcbiAgICAuZmFjdG9yeSgnSGVyZU1hcHNJbmZvQnViYmxlRmFjdG9yeScsIHJlcXVpcmUoJy4vZXZlbnRzL2luZm9idWJibGUuanMnKSk7XG4gICAgXG5hbmd1bGFyLm1vZHVsZSgnaGVyZW1hcHMtdWktbW9kdWxlJywgW10pXG4gICAgLmZhY3RvcnkoJ0hlcmVNYXBzVWlGYWN0b3J5JywgcmVxdWlyZSgnLi91aS91aS5qcycpKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFuZ3VsYXIubW9kdWxlKCdoZXJlbWFwcy1tYXAtbW9kdWxlcycsIFtcblx0J2hlcmVtYXBzLWV2ZW50cy1tb2R1bGUnLFxuICAgICdoZXJlbWFwcy11aS1tb2R1bGUnXG5dKTsiLCJtb2R1bGUuZXhwb3J0cyA9IEhlcmVNYXBzVWlGYWN0b3J5O1xuXG5IZXJlTWFwc1VpRmFjdG9yeS4kaW5qZWN0ID0gW1xuICAgICdIZXJlTWFwc0FQSVNlcnZpY2UnLFxuICAgICdIZXJlTWFwc01hcmtlclNlcnZpY2UnLFxuICAgICdIZXJlTWFwc1V0aWxzU2VydmljZScsXG4gICAgJ0hlcmVNYXBzQ09OU1RTJ1xuXTtcbmZ1bmN0aW9uIEhlcmVNYXBzVWlGYWN0b3J5KEhlcmVNYXBzQVBJU2VydmljZSwgSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLCBIZXJlTWFwc1V0aWxzU2VydmljZSwgSGVyZU1hcHNDT05TVFMpIHtcbiAgICBmdW5jdGlvbiBVSShwbGF0Zm9ybSwgYWxpZ25tZW50KSB7XG4gICAgICAgIHRoaXMubWFwID0gcGxhdGZvcm0ubWFwO1xuICAgICAgICB0aGlzLmxheWVycyA9IHBsYXRmb3JtLmxheWVycztcbiAgICAgICAgdGhpcy5hbGlnbm1lbnQgPSBhbGlnbm1lbnQ7XG4gICAgICAgIHRoaXMudWkgPSBwbGF0Zm9ybS51aSA9IEgudWkuVUkuY3JlYXRlRGVmYXVsdCh0aGlzLm1hcCwgdGhpcy5sYXllcnMpO1xuXG4gICAgICAgIHRoaXMuc2V0dXBDb250cm9scygpO1xuICAgIH1cblxuICAgIFVJLmlzVmFsaWRBbGlnbm1lbnQgPSBpc1ZhbGlkQWxpZ25tZW50O1xuXG4gICAgdmFyIHByb3RvID0gVUkucHJvdG90eXBlO1xuXG4gICAgcHJvdG8uc2V0dXBDb250cm9scyA9IHNldHVwQ29udHJvbHM7XG4gICAgcHJvdG8uY3JlYXRlVXNlckNvbnRyb2wgPSBjcmVhdGVVc2VyQ29udHJvbDtcbiAgICBwcm90by5zZXRDb250cm9sc0FsaWdubWVudCA9IHNldENvbnRyb2xzQWxpZ25tZW50O1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgc3RhcnQ6IGZ1bmN0aW9uKGFyZ3MpIHtcbiAgICAgICAgICAgIGlmICghKGFyZ3MucGxhdGZvcm0ubWFwIGluc3RhbmNlb2YgSC5NYXApICYmICEoYXJncy5wbGF0Zm9ybS5sYXllcnMpKVxuICAgICAgICAgICAgICAgIHJldHVybiBjb25zb2xlLmVycm9yKCdNaXNzZWQgdWkgbW9kdWxlIGRlcGVuZGVuY2llcycpO1xuXG4gICAgICAgICAgICB2YXIgdWkgPSBuZXcgVUkoYXJncy5wbGF0Zm9ybSwgYXJncy5hbGlnbm1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0dXBDb250cm9scygpIHtcbiAgICAgICAgdmFyIE5BTUVTID0gSGVyZU1hcHNDT05TVFMuQ09OVFJPTFMuTkFNRVMsXG4gICAgICAgICAgICB1c2VyQ29udHJvbCA9IHRoaXMuY3JlYXRlVXNlckNvbnRyb2woKTtcblxuICAgICAgICB0aGlzLnVpLmdldENvbnRyb2woTkFNRVMuU0VUVElOR1MpLnNldEluY2lkZW50c0xheWVyKGZhbHNlKTtcbiAgICAgICAgdGhpcy51aS5hZGRDb250cm9sKE5BTUVTLlVTRVIsIHVzZXJDb250cm9sKTtcbiAgICAgICAgdGhpcy5zZXRDb250cm9sc0FsaWdubWVudChOQU1FUyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlVXNlckNvbnRyb2woKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcyxcbiAgICAgICAgICAgIHVzZXJDb250cm9sID0gbmV3IEgudWkuQ29udHJvbCgpLFxuICAgICAgICAgICAgbWFya3VwID0gJzxzdmcgY2xhc3M9XCJIX2ljb25cIiBmaWxsPVwiI2ZmZlwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDE2IDE2XCI+PHBhdGggY2xhc3M9XCJtaWRkbGVfbG9jYXRpb25fc3Ryb2tlXCIgZD1cIk04IDEyYy0yLjIwNiAwLTQtMS43OTUtNC00IDAtMi4yMDYgMS43OTQtNCA0LTRzNCAxLjc5NCA0IDRjMCAyLjIwNS0xLjc5NCA0LTQgNE04IDEuMjVhNi43NSA2Ljc1IDAgMSAwIDAgMTMuNSA2Ljc1IDYuNzUgMCAwIDAgMC0xMy41XCI+PC9wYXRoPjxwYXRoIGNsYXNzPVwiaW5uZXJfbG9jYXRpb25fc3Ryb2tlXCIgZD1cIk04IDVhMyAzIDAgMSAxIC4wMDEgNkEzIDMgMCAwIDEgOCA1bTAtMUM1Ljc5NCA0IDQgNS43OTQgNCA4YzAgMi4yMDUgMS43OTQgNCA0IDRzNC0xLjc5NSA0LTRjMC0yLjIwNi0xLjc5NC00LTQtNFwiPjwvcGF0aD48cGF0aCBjbGFzcz1cIm91dGVyX2xvY2F0aW9uX3N0cm9rZVwiIGQ9XCJNOCAxLjI1YTYuNzUgNi43NSAwIDEgMSAwIDEzLjUgNi43NSA2Ljc1IDAgMCAxIDAtMTMuNU04IDBDMy41OSAwIDAgMy41OSAwIDhjMCA0LjQxMSAzLjU5IDggOCA4czgtMy41ODkgOC04YzAtNC40MS0zLjU5LTgtOC04XCI+PC9wYXRoPjwvc3ZnPic7XG5cbiAgICAgICAgdmFyIHVzZXJDb250cm9sQnV0dG9uID0gbmV3IEgudWkuYmFzZS5CdXR0b24oe1xuICAgICAgICAgICAgbGFiZWw6IG1hcmt1cCxcbiAgICAgICAgICAgIG9uU3RhdGVDaGFuZ2U6IGZ1bmN0aW9uKGV2dCkge1xuICAgICAgICAgICAgICAgIGlmICh1c2VyQ29udHJvbEJ1dHRvbi5nZXRTdGF0ZSgpID09PSBILnVpLmJhc2UuQnV0dG9uLlN0YXRlLkRPV04pXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgICAgIEhlcmVNYXBzQVBJU2VydmljZS5nZXRQb3NpdGlvbigpLnRoZW4oZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHBvc2l0aW9uID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgbG5nOiByZXNwb25zZS5jb29yZHMubG9uZ2l0dWRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGF0OiByZXNwb25zZS5jb29yZHMubGF0aXR1ZGVcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIHNlbGYubWFwLnNldENlbnRlcihwb3NpdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBIZXJlTWFwc1V0aWxzU2VydmljZS56b29tKHNlbGYubWFwLCAxNywgLjA4KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZi51c2VyTWFya2VyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnVzZXJNYXJrZXIuc2V0UG9zaXRpb24ocG9zaXRpb24pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBzZWxmLnVzZXJNYXJrZXIgPSBIZXJlTWFwc01hcmtlclNlcnZpY2UuYWRkVXNlck1hcmtlcihzZWxmLm1hcCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgcG9zOiBwb3NpdGlvblxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdXNlckNvbnRyb2wuYWRkQ2hpbGQodXNlckNvbnRyb2xCdXR0b24pO1xuXG4gICAgICAgIHJldHVybiB1c2VyQ29udHJvbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRDb250cm9sc0FsaWdubWVudChOQU1FUykge1xuICAgICAgICBpZiAoIVVJLmlzVmFsaWRBbGlnbm1lbnQodGhpcy5hbGlnbm1lbnQpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGZvciAodmFyIGlkIGluIE5BTUVTKSB7XG4gICAgICAgICAgICB2YXIgY29udHJvbCA9IHRoaXMudWkuZ2V0Q29udHJvbChOQU1FU1tpZF0pO1xuXG4gICAgICAgICAgICBpZiAoIU5BTUVTLmhhc093blByb3BlcnR5KGlkKSB8fCAhY29udHJvbClcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgY29udHJvbC5zZXRBbGlnbm1lbnQodGhpcy5hbGlnbm1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNWYWxpZEFsaWdubWVudChhbGlnbm1lbnQpIHtcbiAgICAgICAgcmV0dXJuICEhKEhlcmVNYXBzQ09OU1RTLkNPTlRST0xTLlBPU0lUSU9OUy5pbmRleE9mKGFsaWdubWVudCkgKyAxKTtcbiAgICB9XG5cbn07IiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgb3B0aW9ucyA9IHt9O1xuICAgIHZhciBERUZBVUxUX0FQSV9WRVJTSU9OID0gXCIzLjBcIjtcblxuICAgIHRoaXMuJGdldCA9IGZ1bmN0aW9uKCl7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBhcHBfaWQ6IG9wdGlvbnMuYXBwX2lkLFxuICAgICAgICAgICAgYXBwX2NvZGU6IG9wdGlvbnMuYXBwX2NvZGUsXG4gICAgICAgICAgICBhcGlLZXk6IG9wdGlvbnMuYXBpS2V5LFxuICAgICAgICAgICAgYXBpVmVyc2lvbjogb3B0aW9ucy5hcGlWZXJzaW9uIHx8IERFRkFVTFRfQVBJX1ZFUlNJT04sXG4gICAgICAgICAgICB1c2VIVFRQUzogb3B0aW9ucy51c2VIVFRQUyxcbiAgICAgICAgICAgIHVzZUNJVDogISFvcHRpb25zLnVzZUNJVCxcbiAgICAgICAgICAgIG1hcFRpbGVDb25maWc6IG9wdGlvbnMubWFwVGlsZUNvbmZpZ1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIHRoaXMuc2V0T3B0aW9ucyA9IGZ1bmN0aW9uKG9wdHMpe1xuICAgICAgICBvcHRpb25zID0gb3B0cztcbiAgICB9O1xufTsiLCJcbm1vZHVsZS5leHBvcnRzID0gSGVyZU1hcHNVdGlsc1NlcnZpY2U7XG5cbkhlcmVNYXBzVXRpbHNTZXJ2aWNlLiRpbmplY3QgPSBbXG4gICAgJyRyb290U2NvcGUnLCBcbiAgICAnJHRpbWVvdXQnLCBcbiAgICAnSGVyZU1hcHNDT05TVFMnXG5dO1xuZnVuY3Rpb24gSGVyZU1hcHNVdGlsc1NlcnZpY2UoJHJvb3RTY29wZSwgJHRpbWVvdXQsIEhlcmVNYXBzQ09OU1RTKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgdGhyb3R0bGU6IHRocm90dGxlLFxuICAgICAgICBjcmVhdGVTY3JpcHRUYWc6IGNyZWF0ZVNjcmlwdFRhZyxcbiAgICAgICAgY3JlYXRlTGlua1RhZzogY3JlYXRlTGlua1RhZyxcbiAgICAgICAgcnVuU2NvcGVEaWdlc3RJZk5lZWQ6IHJ1blNjb3BlRGlnZXN0SWZOZWVkLFxuICAgICAgICBpc1ZhbGlkQ29vcmRzOiBpc1ZhbGlkQ29vcmRzLFxuICAgICAgICBhZGRFdmVudExpc3RlbmVyOiBhZGRFdmVudExpc3RlbmVyLFxuICAgICAgICB6b29tOiB6b29tLFxuICAgICAgICBnZXRCb3VuZHNSZWN0RnJvbVBvaW50czogZ2V0Qm91bmRzUmVjdEZyb21Qb2ludHMsXG4gICAgICAgIGdlbmVyYXRlSWQ6IGdlbmVyYXRlSWQsXG4gICAgICAgIGdldE1hcEZhY3Rvcnk6IGdldE1hcEZhY3RvcnlcbiAgICB9O1xuXG4gICAgLy8jcmVnaW9uIFBVQkxJQ1xuICAgIGZ1bmN0aW9uIHRocm90dGxlKGZuLCBwZXJpb2QpIHtcbiAgICAgICAgdmFyIHRpbWVvdXQgPSBudWxsO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoJHRpbWVvdXQpXG4gICAgICAgICAgICAgICAgJHRpbWVvdXQuY2FuY2VsKHRpbWVvdXQpO1xuXG4gICAgICAgICAgICB0aW1lb3V0ID0gJHRpbWVvdXQoZm4sIHBlcmlvZCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhZGRFdmVudExpc3RlbmVyKG9iaiwgZXZlbnROYW1lLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSkge1xuICAgICAgICBvYmouYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGxpc3RlbmVyLCAhIXVzZUNhcHR1cmUpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJ1blNjb3BlRGlnZXN0SWZOZWVkKHNjb3BlLCBjYikge1xuICAgICAgICBpZiAoc2NvcGUuJHJvb3QgJiYgc2NvcGUuJHJvb3QuJCRwaGFzZSAhPT0gJyRhcHBseScgJiYgc2NvcGUuJHJvb3QuJCRwaGFzZSAhPT0gJyRkaWdlc3QnKSB7XG4gICAgICAgICAgICBzY29wZS4kZGlnZXN0KGNiIHx8IGFuZ3VsYXIubm9vcCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlU2NyaXB0VGFnKGF0dHJzKSB7XG4gICAgICAgIHZhciBzY3JpcHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhdHRycy5zcmMpO1xuXG4gICAgICAgIGlmIChzY3JpcHQpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgc2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG4gICAgICAgIHNjcmlwdC50eXBlID0gJ3RleHQvamF2YXNjcmlwdCc7XG4gICAgICAgIHNjcmlwdC5pZCA9IGF0dHJzLnNyYztcbiAgICAgICAgX3NldEF0dHJzKHNjcmlwdCwgYXR0cnMpO1xuXG4gICAgICAgIHJldHVybiBzY3JpcHQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlTGlua1RhZyhhdHRycykge1xuICAgICAgICB2YXIgbGluayA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGF0dHJzLmhyZWYpO1xuXG4gICAgICAgIGlmIChsaW5rKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaW5rJyk7XG4gICAgICAgIGxpbmsuaWQgPSBhdHRycy5ocmVmO1xuICAgICAgICBfc2V0QXR0cnMobGluaywgYXR0cnMpO1xuXG4gICAgICAgIHJldHVybiBsaW5rO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzVmFsaWRDb29yZHMoY29vcmRzKSB7XG4gICAgICAgIHJldHVybiBjb29yZHMgJiZcbiAgICAgICAgICAgICh0eXBlb2YgY29vcmRzLmxhdGl0dWRlID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgY29vcmRzLmxhdGl0dWRlID09PSAnbnVtYmVyJykgJiZcbiAgICAgICAgICAgICh0eXBlb2YgY29vcmRzLmxvbmdpdHVkZSA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIGNvb3Jkcy5sb25naXR1ZGUgPT09ICdudW1iZXInKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHpvb20obWFwLCB2YWx1ZSwgc3RlcCkge1xuICAgICAgICB2YXIgY3VycmVudFpvb20gPSBtYXAuZ2V0Wm9vbSgpLFxuICAgICAgICAgICAgX3N0ZXAgPSBzdGVwIHx8IEhlcmVNYXBzQ09OU1RTLkFOSU1BVElPTl9aT09NX1NURVAsXG4gICAgICAgICAgICBmYWN0b3IgPSBjdXJyZW50Wm9vbSA+PSB2YWx1ZSA/IC0xIDogMSxcbiAgICAgICAgICAgIGluY3JlbWVudCA9IHN0ZXAgKiBmYWN0b3I7XG5cbiAgICAgICAgcmV0dXJuIChmdW5jdGlvbiB6b29tKCkge1xuICAgICAgICAgICAgaWYgKCFzdGVwIHx8IE1hdGguZmxvb3IoY3VycmVudFpvb20pID09PSBNYXRoLmZsb29yKHZhbHVlKSkge1xuICAgICAgICAgICAgICAgIG1hcC5zZXRab29tKHZhbHVlKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGN1cnJlbnRab29tICs9IGluY3JlbWVudDtcbiAgICAgICAgICAgIG1hcC5zZXRab29tKGN1cnJlbnRab29tKTtcblxuICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHpvb20pO1xuICAgICAgICB9KSgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldE1hcEZhY3RvcnkoKXtcbiAgICAgICAgcmV0dXJuIEg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBnZXRCb3VuZHNSZWN0RnJvbVBvaW50c1xuICAgICAqIFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSB0b3BMZWZ0IFxuICAgICAqICBAcHJvcGVydHkge051bWJlcnxTdHJpbmd9IGxhdFxuICAgICAqICBAcHJvcGVydHkge051bWJlcnxTdHJpbmd9IGxuZ1xuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBib3R0b21SaWdodCBcbiAgICAgKiAgQHByb3BlcnR5IHtOdW1iZXJ8U3RyaW5nfSBsYXRcbiAgICAgKiAgQHByb3BlcnR5IHtOdW1iZXJ8U3RyaW5nfSBsbmdcbiAgICAgKiBcbiAgICAgKiBAcmV0dXJuIHtILmdlby5SZWN0fVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldEJvdW5kc1JlY3RGcm9tUG9pbnRzKHRvcExlZnQsIGJvdHRvbVJpZ2h0KSB7XG4gICAgICAgIHJldHVybiBILmdlby5SZWN0LmZyb21Qb2ludHModG9wTGVmdCwgYm90dG9tUmlnaHQsIHRydWUpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdlbmVyYXRlSWQoKSB7XG4gICAgICAgIHZhciBtYXNrID0gJ3h4eHh4eHh4LXh4eHgtNHh4eC15eHh4LXh4eHh4eHh4eHh4eCcsXG4gICAgICAgICAgICByZWdleHAgPSAvW3h5XS9nLFxuICAgICAgICAgICAgZCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpLFxuICAgICAgICAgICAgdXVpZCA9IG1hc2sucmVwbGFjZShyZWdleHAsIGZ1bmN0aW9uIChjKSB7XG4gICAgICAgICAgICAgICAgdmFyIHIgPSAoZCArIE1hdGgucmFuZG9tKCkgKiAxNikgJSAxNiB8IDA7XG4gICAgICAgICAgICAgICAgZCA9IE1hdGguZmxvb3IoZCAvIDE2KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKGMgPT0gJ3gnID8gciA6IChyICYgMHgzIHwgMHg4KSkudG9TdHJpbmcoMTYpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHV1aWQ7XG4gICAgfVxuXG4gICAgLy8jZW5kcmVnaW9uIFBVQkxJQyBcblxuICAgIGZ1bmN0aW9uIF9zZXRBdHRycyhlbCwgYXR0cnMpIHtcbiAgICAgICAgaWYgKCFlbCB8fCAhYXR0cnMpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ01pc3NlZCBhdHRyaWJ1dGVzJyk7XG5cbiAgICAgICAgZm9yICh2YXIga2V5IGluIGF0dHJzKSB7XG4gICAgICAgICAgICBpZiAoIWF0dHJzLmhhc093blByb3BlcnR5KGtleSkpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIGVsW2tleV0gPSBhdHRyc1trZXldO1xuICAgICAgICB9XG4gICAgfVxufTsiLCJtb2R1bGUuZXhwb3J0cyA9IEhlcmVNYXBzRGVmYXVsdE1hcmtlcjtcblxuSGVyZU1hcHNEZWZhdWx0TWFya2VyLiRpbmplY3QgPSBbJ0hlcmVNYXBzTWFya2VySW50ZXJmYWNlJ107XG5mdW5jdGlvbiBIZXJlTWFwc0RlZmF1bHRNYXJrZXIoSGVyZU1hcHNNYXJrZXJJbnRlcmZhY2Upe1xuICAgIGZ1bmN0aW9uIERlZmF1bHRNYXJrZXIocGxhY2Upe1xuICAgICAgICB0aGlzLnBsYWNlID0gcGxhY2U7XG4gICAgICAgIHRoaXMuc2V0Q29vcmRzKCk7XG4gICAgfVxuXG4gICAgdmFyIHByb3RvID0gRGVmYXVsdE1hcmtlci5wcm90b3R5cGUgPSBuZXcgSGVyZU1hcHNNYXJrZXJJbnRlcmZhY2UoKTtcbiAgICBwcm90by5jb25zdHJ1Y3RvciA9IERlZmF1bHRNYXJrZXI7XG5cbiAgICBwcm90by5jcmVhdGUgPSBjcmVhdGU7XG5cbiAgICByZXR1cm4gRGVmYXVsdE1hcmtlcjtcbiAgICBcbiAgICBmdW5jdGlvbiBjcmVhdGUoKXtcbiAgICAgICAgdmFyIG1hcmtlciA9IG5ldyBILm1hcC5NYXJrZXIodGhpcy5jb29yZHMpO1xuICAgICAgICBcbiAgICAgICAgdGhpcy5hZGRJbmZvQnViYmxlKG1hcmtlcik7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gbWFya2VyO1xuICAgIH1cbn0iLCJtb2R1bGUuZXhwb3J0cyA9IEhlcmVNYXBzRE9NTWFya2VyO1xuXG5IZXJlTWFwc0RPTU1hcmtlci4kaW5qZWN0ID0gWydIZXJlTWFwc01hcmtlckludGVyZmFjZSddO1xuZnVuY3Rpb24gSGVyZU1hcHNET01NYXJrZXIoSGVyZU1hcHNNYXJrZXJJbnRlcmZhY2Upe1xuICAgIGZ1bmN0aW9uIERPTU1hcmtlcihwbGFjZSl7XG4gICAgICAgIHRoaXMucGxhY2UgPSBwbGFjZTtcbiAgICAgICAgdGhpcy5zZXRDb29yZHMoKTtcbiAgICB9XG5cbiAgICB2YXIgcHJvdG8gPSBET01NYXJrZXIucHJvdG90eXBlID0gbmV3IEhlcmVNYXBzTWFya2VySW50ZXJmYWNlKCk7XG4gICAgcHJvdG8uY29uc3RydWN0b3IgPSBET01NYXJrZXI7XG5cbiAgICBwcm90by5jcmVhdGUgPSBjcmVhdGU7XG4gICAgcHJvdG8uZ2V0SWNvbiA9IGdldEljb247XG4gICAgcHJvdG8uc2V0dXBFdmVudHMgPSBzZXR1cEV2ZW50cztcblxuICAgIHJldHVybiBET01NYXJrZXI7XG4gICAgXG4gICAgZnVuY3Rpb24gY3JlYXRlKCl7XG4gICAgICAgIHZhciBtYXJrZXIgPSBuZXcgSC5tYXAuRG9tTWFya2VyKHRoaXMuY29vcmRzLCB7XG4gICAgICAgICAgICBpY29uOiB0aGlzLmdldEljb24oKVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMuYWRkSW5mb0J1YmJsZShtYXJrZXIpO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIG1hcmtlcjtcbiAgICB9XG4gICAgXG4gICAgZnVuY3Rpb24gZ2V0SWNvbigpe1xuICAgICAgICB2YXIgaWNvbiA9IHRoaXMucGxhY2UubWFya3VwO1xuICAgICAgICAgaWYoIWljb24pXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hcmt1cCBtaXNzZWQnKTtcblxuICAgICAgICByZXR1cm4gbmV3IEgubWFwLkRvbUljb24oaWNvbik7XG4gICAgfVxuICAgIFxuICAgIGZ1bmN0aW9uIHNldHVwRXZlbnRzKGVsLCBldmVudHMsIHJlbW92ZSl7XG4gICAgICAgIHZhciBtZXRob2QgPSByZW1vdmUgPyAncmVtb3ZlRXZlbnRMaXN0ZW5lcicgOiAnYWRkRXZlbnRMaXN0ZW5lcic7XG5cbiAgICAgICAgZm9yKHZhciBrZXkgaW4gZXZlbnRzKSB7XG4gICAgICAgICAgICBpZighZXZlbnRzLmhhc093blByb3BlcnR5KGtleSkpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIGVsW21ldGhvZF0uY2FsbChudWxsLCBrZXksIGV2ZW50c1trZXldKTtcbiAgICAgICAgfVxuICAgIH1cbn0iLCJtb2R1bGUuZXhwb3J0cyA9IGFuZ3VsYXIubW9kdWxlKCdoZXJlbWFwcy1tYXJrZXJzLW1vZHVsZScsIFtdKVxuICAgIC5mYWN0b3J5KCdIZXJlTWFwc01hcmtlckludGVyZmFjZScsIHJlcXVpcmUoJy4vbWFya2VyLmpzJykpXG4gICAgLmZhY3RvcnkoJ0hlcmVNYXBzRGVmYXVsdE1hcmtlcicsIHJlcXVpcmUoJy4vZGVmYXVsdC5tYXJrZXIuanMnKSlcbiAgICAuZmFjdG9yeSgnSGVyZU1hcHNET01NYXJrZXInLCByZXF1aXJlKCcuL2RvbS5tYXJrZXIuanMnKSlcbiAgICAuZmFjdG9yeSgnSGVyZU1hcHNTVkdNYXJrZXInLCByZXF1aXJlKCcuL3N2Zy5tYXJrZXIuanMnKSlcbiAgICAuc2VydmljZSgnSGVyZU1hcHNNYXJrZXJTZXJ2aWNlJywgcmVxdWlyZSgnLi9tYXJrZXJzLnNlcnZpY2UuanMnKSk7IiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpe1xuICAgIGZ1bmN0aW9uIE1hcmtlckludGVyZmFjZSgpe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Fic3RyYWN0IGNsYXNzISBUaGUgSW5zdGFuY2Ugc2hvdWxkIGJlIGNyZWF0ZWQnKTtcbiAgICB9XG4gICAgXG4gICAgdmFyIHByb3RvID0gTWFya2VySW50ZXJmYWNlLnByb3RvdHlwZTtcbiAgICBcbiAgICBwcm90by5jcmVhdGUgPSBjcmVhdGU7XG4gICAgcHJvdG8uc2V0Q29vcmRzID0gc2V0Q29vcmRzO1xuICAgIHByb3RvLmFkZEluZm9CdWJibGUgPSBhZGRJbmZvQnViYmxlO1xuICAgIFxuICAgIGZ1bmN0aW9uIE1hcmtlcigpe31cbiAgICBcbiAgICBNYXJrZXIucHJvdG90eXBlID0gcHJvdG87XG4gICAgXG4gICAgcmV0dXJuIE1hcmtlcjtcbiAgICBcbiAgICBmdW5jdGlvbiBjcmVhdGUoKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjcmVhdGU6OiBub3QgaW1wbGVtZW50ZWQnKTsgXG4gICAgfVxuICAgIFxuICAgIGZ1bmN0aW9uIHNldENvb3Jkcygpe1xuICAgICAgICAgdGhpcy5jb29yZHMgPSB7XG4gICAgICAgICAgICBsYXQ6IHRoaXMucGxhY2UucG9zLmxhdCxcbiAgICAgICAgICAgIGxuZzogdGhpcy5wbGFjZS5wb3MubG5nXG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgZnVuY3Rpb24gYWRkSW5mb0J1YmJsZShtYXJrZXIpe1xuICAgICAgICBpZighdGhpcy5wbGFjZS5wb3B1cClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIFxuICAgICAgICBtYXJrZXIuc2V0RGF0YSh0aGlzLnBsYWNlLnBvcHVwKVxuICAgIH1cbn0iLCJtb2R1bGUuZXhwb3J0cyA9IEhlcmVNYXBzTWFya2VyU2VydmljZTtcblxuSGVyZU1hcHNNYXJrZXJTZXJ2aWNlLiRpbmplY3QgPSBbXG4gICAgJ0hlcmVNYXBzRGVmYXVsdE1hcmtlcicsXG4gICAgJ0hlcmVNYXBzRE9NTWFya2VyJyxcbiAgICAnSGVyZU1hcHNTVkdNYXJrZXInLFxuICAgICdIZXJlTWFwc0NPTlNUUydcbl07XG5mdW5jdGlvbiBIZXJlTWFwc01hcmtlclNlcnZpY2UoSGVyZU1hcHNEZWZhdWx0TWFya2VyLCBIZXJlTWFwc0RPTU1hcmtlciwgSGVyZU1hcHNTVkdNYXJrZXIsIEhlcmVNYXBzQ09OU1RTKSB7XG4gICAgdmFyIE1BUktFUl9UWVBFUyA9IEhlcmVNYXBzQ09OU1RTLk1BUktFUl9UWVBFUztcblxuICAgIHJldHVybiB7XG4gICAgICAgIGFkZE1hcmtlcnNUb01hcDogYWRkTWFya2Vyc1RvTWFwLFxuICAgICAgICBhZGRVc2VyTWFya2VyOiBhZGRVc2VyTWFya2VyLFxuICAgICAgICB1cGRhdGVNYXJrZXJzOiB1cGRhdGVNYXJrZXJzLFxuICAgICAgICBpc01hcmtlckluc3RhbmNlOiBpc01hcmtlckluc3RhbmNlLFxuICAgICAgICBzZXRWaWV3Qm91bmRzOiBzZXRWaWV3Qm91bmRzXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNNYXJrZXJJbnN0YW5jZSh0YXJnZXQpIHtcbiAgICAgICAgcmV0dXJuIHRhcmdldCBpbnN0YW5jZW9mIEgubWFwLk1hcmtlciB8fCB0YXJnZXQgaW5zdGFuY2VvZiBILm1hcC5Eb21NYXJrZXI7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYWRkVXNlck1hcmtlcihtYXAsIHBsYWNlKSB7XG4gICAgICAgIGlmIChtYXAudXNlck1hcmtlcilcbiAgICAgICAgICAgIHJldHVybiBtYXAudXNlck1hcmtlcjtcblxuICAgICAgICBwbGFjZS5tYXJrdXAgPSAnPHN2ZyB3aWR0aD1cIjM1cHhcIiBoZWlnaHQ9XCIzNXB4XCIgdmlld0JveD1cIjAgMCA5MCA5MFwiIHZlcnNpb249XCIxLjFcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgeG1sbnM6eGxpbms9XCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rXCI+JyArXG4gICAgICAgICAgICAnPGRlZnM+PGNpcmNsZSBpZD1cInBhdGgtMVwiIGN4PVwiMzAyXCIgY3k9XCI4MDJcIiByPVwiMTVcIj48L2NpcmNsZT4nICtcbiAgICAgICAgICAgICc8bWFzayBpZD1cIm1hc2stMlwiIG1hc2tDb250ZW50VW5pdHM9XCJ1c2VyU3BhY2VPblVzZVwiIG1hc2tVbml0cz1cIm9iamVjdEJvdW5kaW5nQm94XCIgeD1cIi0zMFwiIHk9XCItMzBcIiB3aWR0aD1cIjkwXCIgaGVpZ2h0PVwiOTBcIj4nICtcbiAgICAgICAgICAgICc8cmVjdCB4PVwiMjU3XCIgeT1cIjc1N1wiIHdpZHRoPVwiOTBcIiBoZWlnaHQ9XCI5MFwiIGZpbGw9XCJ3aGl0ZVwiPjwvcmVjdD48dXNlIHhsaW5rOmhyZWY9XCIjcGF0aC0xXCIgZmlsbD1cImJsYWNrXCI+PC91c2U+JyArXG4gICAgICAgICAgICAnPC9tYXNrPjwvZGVmcz48ZyBpZD1cIlBhZ2UtMVwiIHN0cm9rZT1cIm5vbmVcIiBzdHJva2Utd2lkdGg9XCIxXCIgZmlsbD1cIm5vbmVcIiBmaWxsLXJ1bGU9XCJldmVub2RkXCI+JyArXG4gICAgICAgICAgICAnPGcgaWQ9XCJTZXJ2aWNlLU9wdGlvbnMtLS1kaXJlY3Rpb25zLS0tbWFwXCIgdHJhbnNmb3JtPVwidHJhbnNsYXRlKC0yNTcuMDAwMDAwLCAtNzU3LjAwMDAwMClcIj48ZyBpZD1cIk92YWwtMTVcIj4nICtcbiAgICAgICAgICAgICc8dXNlIGZpbGw9XCIjRkZGRkZGXCIgZmlsbC1ydWxlPVwiZXZlbm9kZFwiIHhsaW5rOmhyZWY9XCIjcGF0aC0xXCI+PC91c2U+JyArXG4gICAgICAgICAgICAnPHVzZSBzdHJva2Utb3BhY2l0eT1cIjAuMjk2MTM5MDRcIiBzdHJva2U9XCIjM0YzNEEwXCIgbWFzaz1cInVybCgjbWFzay0yKVwiIHN0cm9rZS13aWR0aD1cIjYwXCIgeGxpbms6aHJlZj1cIiNwYXRoLTFcIj48L3VzZT4nICtcbiAgICAgICAgICAgICc8dXNlIHN0cm9rZT1cIiMzRjM0QTBcIiBzdHJva2Utd2lkdGg9XCI1XCIgeGxpbms6aHJlZj1cIiNwYXRoLTFcIj48L3VzZT48L2c+PC9nPjwvZz48L3N2Zz4nO1xuXG4gICAgICAgIG1hcC51c2VyTWFya2VyID0gbmV3IEhlcmVNYXBzU1ZHTWFya2VyKHBsYWNlKS5jcmVhdGUoKTtcblxuICAgICAgICBtYXAuYWRkT2JqZWN0KG1hcC51c2VyTWFya2VyKTtcblxuICAgICAgICByZXR1cm4gbWFwLnVzZXJNYXJrZXI7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYWRkTWFya2Vyc1RvTWFwKG1hcCwgcGxhY2VzLCByZWZyZXNoVmlld2JvdW5kcykge1xuICAgICAgICBpZiAoIXBsYWNlcyB8fCAhcGxhY2VzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAoIShtYXAgaW5zdGFuY2VvZiBILk1hcCkpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIG1hcCBpbnN0YW5jZScpO1xuXG4gICAgICAgIGlmICghbWFwLm1hcmtlcnNHcm91cClcbiAgICAgICAgICAgIG1hcC5tYXJrZXJzR3JvdXAgPSBuZXcgSC5tYXAuR3JvdXAoKTtcblxuICAgICAgICBwbGFjZXMuZm9yRWFjaChmdW5jdGlvbiAocGxhY2UsIGkpIHtcbiAgICAgICAgICAgIHZhciBjcmVhdG9yID0gX2dldE1hcmtlckNyZWF0b3IocGxhY2UpLFxuICAgICAgICAgICAgICAgIG1hcmtlciA9IHBsYWNlLmRyYWdnYWJsZSA/IF9kcmFnZ2FibGVNYXJrZXJNaXhpbihjcmVhdG9yLmNyZWF0ZSgpKSA6IGNyZWF0b3IuY3JlYXRlKCk7XG5cbiAgICAgICAgICAgIG1hcC5tYXJrZXJzR3JvdXAuYWRkT2JqZWN0KG1hcmtlcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIG1hcC5hZGRPYmplY3QobWFwLm1hcmtlcnNHcm91cCk7XG5cbiAgICAgICAgaWYgKHJlZnJlc2hWaWV3Ym91bmRzKSB7XG4gICAgICAgICAgICBzZXRWaWV3Qm91bmRzKG1hcCwgbWFwLm1hcmtlcnNHcm91cC5nZXRCb3VuZHMoKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRWaWV3Qm91bmRzKG1hcCwgYm91bmRzLCBvcHRfYW5pbWF0ZSkge1xuICAgICAgICBtYXAuc2V0Vmlld0JvdW5kcyhib3VuZHMsICEhb3B0X2FuaW1hdGUpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZU1hcmtlcnMobWFwLCBwbGFjZXMsIHJlZnJlc2hWaWV3Ym91bmRzKSB7XG4gICAgICAgIGlmIChtYXAubWFya2Vyc0dyb3VwKSB7XG4gICAgICAgICAgICBtYXAubWFya2Vyc0dyb3VwLnJlbW92ZUFsbCgpO1xuICAgICAgICAgICAgbWFwLnJlbW92ZU9iamVjdChtYXAubWFya2Vyc0dyb3VwKTtcbiAgICAgICAgICAgIG1hcC5tYXJrZXJzR3JvdXAgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgYWRkTWFya2Vyc1RvTWFwLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2dldE1hcmtlckNyZWF0b3IocGxhY2UpIHtcbiAgICAgICAgdmFyIENvbmNyZXRlTWFya2VyLFxuICAgICAgICAgICAgdHlwZSA9IHBsYWNlLnR5cGUgPyBwbGFjZS50eXBlLnRvVXBwZXJDYXNlKCkgOiBudWxsO1xuXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSBNQVJLRVJfVFlQRVMuRE9NOlxuICAgICAgICAgICAgICAgIENvbmNyZXRlTWFya2VyID0gSGVyZU1hcHNET01NYXJrZXI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIE1BUktFUl9UWVBFUy5TVkc6XG4gICAgICAgICAgICAgICAgQ29uY3JldGVNYXJrZXIgPSBIZXJlTWFwc1NWR01hcmtlcjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgQ29uY3JldGVNYXJrZXIgPSBIZXJlTWFwc0RlZmF1bHRNYXJrZXI7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IENvbmNyZXRlTWFya2VyKHBsYWNlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfZHJhZ2dhYmxlTWFya2VyTWl4aW4obWFya2VyKSB7XG4gICAgICAgIG1hcmtlci5kcmFnZ2FibGUgPSB0cnVlO1xuXG4gICAgICAgIHJldHVybiBtYXJrZXI7XG4gICAgfVxufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gSGVyZU1hcHNTVkdNYXJrZXI7XG5cbkhlcmVNYXBzU1ZHTWFya2VyLiRpbmplY3QgPSBbJ0hlcmVNYXBzTWFya2VySW50ZXJmYWNlJ107XG5mdW5jdGlvbiBIZXJlTWFwc1NWR01hcmtlcihIZXJlTWFwc01hcmtlckludGVyZmFjZSl7XG4gICAgZnVuY3Rpb24gU1ZHTWFya2VyKHBsYWNlKXtcbiAgICAgICAgdGhpcy5wbGFjZSA9IHBsYWNlO1xuICAgICAgICB0aGlzLnNldENvb3JkcygpO1xuICAgIH1cbiAgICBcbiAgICB2YXIgcHJvdG8gPSBTVkdNYXJrZXIucHJvdG90eXBlID0gbmV3IEhlcmVNYXBzTWFya2VySW50ZXJmYWNlKCk7XG4gICAgcHJvdG8uY29uc3RydWN0b3IgPSBTVkdNYXJrZXI7XG4gICAgXG4gICAgcHJvdG8uY3JlYXRlID0gY3JlYXRlO1xuICAgIHByb3RvLmdldEljb24gPSBnZXRJY29uO1xuICAgIFxuICAgIHJldHVybiBTVkdNYXJrZXI7XG4gICAgXG4gICAgZnVuY3Rpb24gY3JlYXRlKCl7XG4gICAgICAgIHZhciBtYXJrZXIgPSBuZXcgSC5tYXAuTWFya2VyKHRoaXMuY29vcmRzLCB7XG4gICAgICAgICAgICBpY29uOiB0aGlzLmdldEljb24oKSxcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmFkZEluZm9CdWJibGUobWFya2VyKTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBtYXJrZXI7XG4gICAgfVxuICAgIFxuICAgIGZ1bmN0aW9uIGdldEljb24oKXtcbiAgICAgICAgdmFyIGljb24gPSB0aGlzLnBsYWNlLm1hcmt1cDtcbiAgICAgICAgIGlmKCFpY29uKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXJrdXAgbWlzc2VkJyk7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBILm1hcC5JY29uKGljb24pO1xuICAgIH1cbn0iLCJtb2R1bGUuZXhwb3J0cyA9IGFuZ3VsYXIubW9kdWxlKCdoZXJlbWFwcy1yb3V0ZXMtbW9kdWxlJywgW10pXG4gICAgICAgICAgICAgICAgICAgIC5zZXJ2aWNlKCdIZXJlTWFwc1JvdXRlc1NlcnZpY2UnLCByZXF1aXJlKCcuL3JvdXRlcy5zZXJ2aWNlLmpzJykpOyAgIiwibW9kdWxlLmV4cG9ydHMgPSBIZXJlTWFwc1JvdXRlc1NlcnZpY2U7XG5cbkhlcmVNYXBzUm91dGVzU2VydmljZS4kaW5qZWN0ID0gWyckcScsICdIZXJlTWFwc01hcmtlclNlcnZpY2UnXTtcbmZ1bmN0aW9uIEhlcmVNYXBzUm91dGVzU2VydmljZSgkcSwgSGVyZU1hcHNNYXJrZXJTZXJ2aWNlKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY2FsY3VsYXRlUm91dGU6IGNhbGN1bGF0ZVJvdXRlLFxuICAgICAgICBhZGRSb3V0ZVRvTWFwOiBhZGRSb3V0ZVRvTWFwLFxuICAgICAgICBjbGVhblJvdXRlczogY2xlYW5Sb3V0ZXNcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjYWxjdWxhdGVSb3V0ZShoZXJlbWFwcywgY29uZmlnKSB7XG4gICAgICAgIHZhciBwbGF0Zm9ybSA9IGhlcmVtYXBzLnBsYXRmb3JtLFxuICAgICAgICAgICAgbWFwID0gaGVyZW1hcHMubWFwLFxuICAgICAgICAgICAgcm91dGVyID0gcGxhdGZvcm0uZ2V0Um91dGluZ1NlcnZpY2UoKSxcbiAgICAgICAgICAgIGRpciA9IGNvbmZpZy5kaXJlY3Rpb24sXG4gICAgICAgICAgICB3YXlwb2ludHMgPSBkaXIud2F5cG9pbnRzO1xuXG4gICAgICAgIHZhciBtb2RlID0gJ3t7TU9ERX19O3t7VkVDSElMRX19J1xuICAgICAgICAgICAgLnJlcGxhY2UoL3t7TU9ERX19LywgZGlyLm1vZGUgfHwgJ2Zhc3Rlc3QnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL3t7VkVDSElMRX19LywgY29uZmlnLmRyaXZlVHlwZSk7XG5cbiAgICAgICAgdmFyIHJvdXRlUmVxdWVzdFBhcmFtcyA9IHtcbiAgICAgICAgICAgIG1vZGU6IG1vZGUsXG4gICAgICAgICAgICByZXByZXNlbnRhdGlvbjogZGlyLnJlcHJlc2VudGF0aW9uIHx8ICdkaXNwbGF5JyxcbiAgICAgICAgICAgIGxhbmd1YWdlOiBkaXIubGFuZ3VhZ2UgfHwgJ2VuLWdiJ1xuICAgICAgICB9O1xuXG4gICAgICAgIHdheXBvaW50cy5mb3JFYWNoKGZ1bmN0aW9uICh3YXlwb2ludCwgaSkge1xuICAgICAgICAgICAgcm91dGVSZXF1ZXN0UGFyYW1zW1wid2F5cG9pbnRcIiArIGldID0gW3dheXBvaW50LmxhdCwgd2F5cG9pbnQubG5nXS5qb2luKCcsJyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIF9zZXRBdHRyaWJ1dGVzKHJvdXRlUmVxdWVzdFBhcmFtcywgZGlyLmF0dHJzKTtcblxuICAgICAgICB2YXIgZGVmZXJyZWQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIHJvdXRlci5jYWxjdWxhdGVSb3V0ZShyb3V0ZVJlcXVlc3RQYXJhbXMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGVhblJvdXRlcyhtYXApIHtcbiAgICAgICAgdmFyIGdyb3VwID0gbWFwLnJvdXRlc0dyb3VwO1xuXG4gICAgICAgIGlmICghZ3JvdXApXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgZ3JvdXAucmVtb3ZlQWxsKCk7XG4gICAgICAgIG1hcC5yZW1vdmVPYmplY3QoZ3JvdXApO1xuICAgICAgICBtYXAucm91dGVzR3JvdXAgPSBudWxsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFkZFJvdXRlVG9NYXAobWFwLCByb3V0ZURhdGEsIGNsZWFuKSB7XG4gICAgICAgIGlmIChjbGVhbilcbiAgICAgICAgICAgIGNsZWFuUm91dGVzKG1hcCk7XG5cbiAgICAgICAgdmFyIHJvdXRlID0gcm91dGVEYXRhLnJvdXRlO1xuXG4gICAgICAgIGlmICghbWFwIHx8ICFyb3V0ZSB8fCAhcm91dGUuc2hhcGUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHN0cmlwID0gbmV3IEguZ2VvLlN0cmlwKCksIHBvbHlsaW5lID0gbnVsbDtcblxuICAgICAgICByb3V0ZS5zaGFwZS5mb3JFYWNoKGZ1bmN0aW9uIChwb2ludCkge1xuICAgICAgICAgICAgdmFyIHBhcnRzID0gcG9pbnQuc3BsaXQoJywnKTtcbiAgICAgICAgICAgIHN0cmlwLnB1c2hMYXRMbmdBbHQocGFydHNbMF0sIHBhcnRzWzFdKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIHN0eWxlID0gcm91dGVEYXRhLnN0eWxlIHx8IHt9O1xuXG4gICAgICAgIHBvbHlsaW5lID0gbmV3IEgubWFwLlBvbHlsaW5lKHN0cmlwLCB7XG4gICAgICAgICAgICBzdHlsZToge1xuICAgICAgICAgICAgICAgIGxpbmVXaWR0aDogc3R5bGUubGluZVdpZHRoIHx8IDQsXG4gICAgICAgICAgICAgICAgc3Ryb2tlQ29sb3I6IHN0eWxlLmNvbG9yIHx8ICdyZ2JhKDAsIDEyOCwgMjU1LCAwLjcpJ1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgZ3JvdXAgPSBtYXAucm91dGVzR3JvdXA7XG5cbiAgICAgICAgaWYgKCFncm91cCkge1xuICAgICAgICAgICAgZ3JvdXAgPSBtYXAucm91dGVzR3JvdXAgPSBuZXcgSC5tYXAuR3JvdXAoKTtcbiAgICAgICAgICAgIG1hcC5hZGRPYmplY3QoZ3JvdXApO1xuICAgICAgICB9XG5cbiAgICAgICAgZ3JvdXAuYWRkT2JqZWN0KHBvbHlsaW5lKTtcblxuICAgICAgICBpZihyb3V0ZURhdGEuem9vbVRvQm91bmRzKSB7XG4gICAgICAgICAgICBIZXJlTWFwc01hcmtlclNlcnZpY2Uuc2V0Vmlld0JvdW5kcyhtYXAsIHBvbHlsaW5lLmdldEJvdW5kcygpLCB0cnVlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vI3JlZ2lvbiBQUklWQVRFXG5cbiAgICBmdW5jdGlvbiBfc2V0QXR0cmlidXRlcyhwYXJhbXMsIGF0dHJzKSB7XG4gICAgICAgIHZhciBfa2V5ID0gJ2F0dHJpYnV0ZXMnO1xuICAgICAgICBmb3IgKHZhciBrZXkgaW4gYXR0cnMpIHtcbiAgICAgICAgICAgIGlmICghYXR0cnMuaGFzT3duUHJvcGVydHkoa2V5KSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgcGFyYW1zW2tleSArIF9rZXldID0gYXR0cnNba2V5XTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBzZXJpZXMgb2YgSC5tYXAuTWFya2VyIHBvaW50cyBmcm9tIHRoZSByb3V0ZSBhbmQgYWRkcyB0aGVtIHRvIHRoZSBtYXAuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHJvdXRlICBBIHJvdXRlIGFzIHJlY2VpdmVkIGZyb20gdGhlIEguc2VydmljZS5Sb3V0aW5nU2VydmljZVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGFkZE1hbnVldmVyc1RvTWFwKG1hcCwgcm91dGUpIHtcbiAgICAgICAgdmFyIHN2Z01hcmt1cCA9ICc8c3ZnIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIxOFwiICcgK1xuICAgICAgICAgICAgJ3htbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIj4nICtcbiAgICAgICAgICAgICc8Y2lyY2xlIGN4PVwiOFwiIGN5PVwiOFwiIHI9XCI4XCIgJyArXG4gICAgICAgICAgICAnZmlsbD1cIiMxYjQ2OGRcIiBzdHJva2U9XCJ3aGl0ZVwiIHN0cm9rZS13aWR0aD1cIjFcIiAgLz4nICtcbiAgICAgICAgICAgICc8L3N2Zz4nLFxuICAgICAgICAgICAgZG90SWNvbiA9IG5ldyBILm1hcC5JY29uKHN2Z01hcmt1cCwgeyBhbmNob3I6IHsgeDogOCwgeTogOCB9IH0pLFxuICAgICAgICAgICAgZ3JvdXAgPSBuZXcgSC5tYXAuR3JvdXAoKSwgaSwgajtcblxuICAgICAgICAvLyBBZGQgYSBtYXJrZXIgZm9yIGVhY2ggbWFuZXV2ZXJcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvdXRlLmxlZy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IHJvdXRlLmxlZ1tpXS5tYW5ldXZlci5sZW5ndGg7IGogKz0gMSkge1xuICAgICAgICAgICAgICAgIC8vIEdldCB0aGUgbmV4dCBtYW5ldXZlci5cbiAgICAgICAgICAgICAgICBtYW5ldXZlciA9IHJvdXRlLmxlZ1tpXS5tYW5ldXZlcltqXTtcbiAgICAgICAgICAgICAgICAvLyBBZGQgYSBtYXJrZXIgdG8gdGhlIG1hbmV1dmVycyBncm91cFxuICAgICAgICAgICAgICAgIHZhciBtYXJrZXIgPSBuZXcgSC5tYXAuTWFya2VyKHtcbiAgICAgICAgICAgICAgICAgICAgbGF0OiBtYW5ldXZlci5wb3NpdGlvbi5sYXRpdHVkZSxcbiAgICAgICAgICAgICAgICAgICAgbG5nOiBtYW5ldXZlci5wb3NpdGlvbi5sb25naXR1ZGVcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB7IGljb246IGRvdEljb24gfVxuICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICBtYXJrZXIuaW5zdHJ1Y3Rpb24gPSBtYW5ldXZlci5pbnN0cnVjdGlvbjtcbiAgICAgICAgICAgICAgICBncm91cC5hZGRPYmplY3QobWFya2VyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGdyb3VwLmFkZEV2ZW50TGlzdGVuZXIoJ3RhcCcsIGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgICAgIG1hcC5zZXRDZW50ZXIoZXZ0LnRhcmdldC5nZXRQb3NpdGlvbigpKTtcbiAgICAgICAgICAgIG9wZW5CdWJibGUoZXZ0LnRhcmdldC5nZXRQb3NpdGlvbigpLCBldnQudGFyZ2V0Lmluc3RydWN0aW9uKTtcbiAgICAgICAgfSwgZmFsc2UpO1xuXG4gICAgICAgIC8vIEFkZCB0aGUgbWFuZXV2ZXJzIGdyb3VwIHRvIHRoZSBtYXBcbiAgICAgICAgbWFwLmFkZE9iamVjdChncm91cCk7XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgc2VyaWVzIG9mIEgubWFwLk1hcmtlciBwb2ludHMgZnJvbSB0aGUgcm91dGUgYW5kIGFkZHMgdGhlbSB0byB0aGUgbWFwLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSByb3V0ZSAgQSByb3V0ZSBhcyByZWNlaXZlZCBmcm9tIHRoZSBILnNlcnZpY2UuUm91dGluZ1NlcnZpY2VcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhZGRXYXlwb2ludHNUb1BhbmVsKHdheXBvaW50cykge1xuICAgICAgICB2YXIgbm9kZUgzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaDMnKSxcbiAgICAgICAgICAgIHdheXBvaW50TGFiZWxzID0gW10sXG4gICAgICAgICAgICBpO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAgIHdheXBvaW50TGFiZWxzLnB1c2god2F5cG9pbnRzW2ldLmxhYmVsKVxuICAgICAgICB9XG5cbiAgICAgICAgbm9kZUgzLnRleHRDb250ZW50ID0gd2F5cG9pbnRMYWJlbHMuam9pbignIC0gJyk7XG5cbiAgICAgICAgcm91dGVJbnN0cnVjdGlvbnNDb250YWluZXIuaW5uZXJIVE1MID0gJyc7XG4gICAgICAgIHJvdXRlSW5zdHJ1Y3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKG5vZGVIMyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIHNlcmllcyBvZiBILm1hcC5NYXJrZXIgcG9pbnRzIGZyb20gdGhlIHJvdXRlIGFuZCBhZGRzIHRoZW0gdG8gdGhlIG1hcC5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcm91dGUgIEEgcm91dGUgYXMgcmVjZWl2ZWQgZnJvbSB0aGUgSC5zZXJ2aWNlLlJvdXRpbmdTZXJ2aWNlXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkU3VtbWFyeVRvUGFuZWwoc3VtbWFyeSkge1xuICAgICAgICB2YXIgc3VtbWFyeURpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuICAgICAgICAgICAgY29udGVudCA9ICcnO1xuXG4gICAgICAgIGNvbnRlbnQgKz0gJzxiPlRvdGFsIGRpc3RhbmNlPC9iPjogJyArIHN1bW1hcnkuZGlzdGFuY2UgKyAnbS4gPGJyLz4nO1xuICAgICAgICBjb250ZW50ICs9ICc8Yj5UcmF2ZWwgVGltZTwvYj46ICcgKyBzdW1tYXJ5LnRyYXZlbFRpbWUudG9NTVNTKCkgKyAnIChpbiBjdXJyZW50IHRyYWZmaWMpJztcblxuXG4gICAgICAgIHN1bW1hcnlEaXYuc3R5bGUuZm9udFNpemUgPSAnc21hbGwnO1xuICAgICAgICBzdW1tYXJ5RGl2LnN0eWxlLm1hcmdpbkxlZnQgPSAnNSUnO1xuICAgICAgICBzdW1tYXJ5RGl2LnN0eWxlLm1hcmdpblJpZ2h0ID0gJzUlJztcbiAgICAgICAgc3VtbWFyeURpdi5pbm5lckhUTUwgPSBjb250ZW50O1xuICAgICAgICByb3V0ZUluc3RydWN0aW9uc0NvbnRhaW5lci5hcHBlbmRDaGlsZChzdW1tYXJ5RGl2KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgc2VyaWVzIG9mIEgubWFwLk1hcmtlciBwb2ludHMgZnJvbSB0aGUgcm91dGUgYW5kIGFkZHMgdGhlbSB0byB0aGUgbWFwLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSByb3V0ZSAgQSByb3V0ZSBhcyByZWNlaXZlZCBmcm9tIHRoZSBILnNlcnZpY2UuUm91dGluZ1NlcnZpY2VcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhZGRNYW51ZXZlcnNUb1BhbmVsKHJvdXRlKSB7XG4gICAgICAgIHZhciBub2RlT0wgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvbCcpLCBpLCBqO1xuXG4gICAgICAgIG5vZGVPTC5zdHlsZS5mb250U2l6ZSA9ICdzbWFsbCc7XG4gICAgICAgIG5vZGVPTC5zdHlsZS5tYXJnaW5MZWZ0ID0gJzUlJztcbiAgICAgICAgbm9kZU9MLnN0eWxlLm1hcmdpblJpZ2h0ID0gJzUlJztcbiAgICAgICAgbm9kZU9MLmNsYXNzTmFtZSA9ICdkaXJlY3Rpb25zJztcblxuICAgICAgICAvLyBBZGQgYSBtYXJrZXIgZm9yIGVhY2ggbWFuZXV2ZXJcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvdXRlLmxlZy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IHJvdXRlLmxlZ1tpXS5tYW5ldXZlci5sZW5ndGg7IGogKz0gMSkge1xuICAgICAgICAgICAgICAgIC8vIEdldCB0aGUgbmV4dCBtYW5ldXZlci5cbiAgICAgICAgICAgICAgICBtYW5ldXZlciA9IHJvdXRlLmxlZ1tpXS5tYW5ldXZlcltqXTtcblxuICAgICAgICAgICAgICAgIHZhciBsaSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyksXG4gICAgICAgICAgICAgICAgICAgIHNwYW5BcnJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKSxcbiAgICAgICAgICAgICAgICAgICAgc3Bhbkluc3RydWN0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXG4gICAgICAgICAgICAgICAgc3BhbkFycm93LmNsYXNzTmFtZSA9ICdhcnJvdyAnICsgbWFuZXV2ZXIuYWN0aW9uO1xuICAgICAgICAgICAgICAgIHNwYW5JbnN0cnVjdGlvbi5pbm5lckhUTUwgPSBtYW5ldXZlci5pbnN0cnVjdGlvbjtcbiAgICAgICAgICAgICAgICBsaS5hcHBlbmRDaGlsZChzcGFuQXJyb3cpO1xuICAgICAgICAgICAgICAgIGxpLmFwcGVuZENoaWxkKHNwYW5JbnN0cnVjdGlvbik7XG5cbiAgICAgICAgICAgICAgICBub2RlT0wuYXBwZW5kQ2hpbGQobGkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcm91dGVJbnN0cnVjdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQobm9kZU9MKTtcbiAgICB9XG5cbn07XG4iXX0=
