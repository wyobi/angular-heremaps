/**
 * Created by Dmytro on 4/26/2016.
 */
var istanbul = require('browserify-istanbul');

module.exports = function (config) {
    config.set({
        basePath: '',
        frameworks: ['browserify', 'jasmine'],

        files: [
            './node_modules/angular/angular.js',
            './node_modules/angular-mocks/angular-mocks.js',
            './src/**/*.js',
            './src/**/*spec.js'
        ],

        preprocessors: {
            './src/**/*.js': ['browserify']
        },

        browserify: {
            debug: true,
            transform: ['browserify-istanbul']
        },

        colors: true,
        logLevel: config.LOG_INFO,
        
        plugins : [
            'karma-browserify',
            'karma-jasmine',
            'karma-mocha-reporter',
            'karma-phantomjs-launcher',
            'karma-chrome-launcher',
            'karma-coverage'
        ],

        reporters: ['mocha', 'progress', 'coverage'],
        
        coverageReporter: {
            reporters: [{
                type: 'lcov',
                dir: 'coverage/'
            }, {
                type: 'text-summary'
            }]
        },

        browsers: ['ChromeHeadless'],
        customLaunchers: {
            ChromeHeadless: {
                base: 'Chrome',
                flags: ['--headless', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9222']
            }
        },
        // browsers: ['Chrome'],

        autoWatch: false,
        singleRun: true
    });
};
