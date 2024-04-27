/**
 * Created by Dmytro on 3/27/2016.
 */
const browserify = require('browserify'),
      gulp = require('gulp'),
      source = require('vinyl-source-stream'),
      minify = require('gulp-minify'),
      buffer = require('vinyl-buffer'),
      config = require('./package.json'),
      argv = require('yargs').argv,
      browserSync = require("browser-sync").create();

/* pathConfig */
const entryPoint = './src/index.js',
      browserDir = './',
      jsWatchPath = './src/**/*.js';
/**/

// Initialize Browser-Sync
function browserSyncTask(done) {
    browserSync.init({
        server: {
            baseDir: browserDir
        }
    });
    done();
}

// Build task
function build() {
    return browserify(entryPoint, { debug: true })
        .bundle()
        .pipe(source('angular-heremaps.js'))
        .pipe(buffer())
        .pipe(minify({
            ext: {
                min: '.min.js'
            },
        }))
        .pipe(gulp.dest('./dist/'))
        .pipe(browserSync.reload({ stream: true }));
}

// Serve task
function serve() {
    gulp.watch(jsWatchPath, build).on('change', browserSync.reload);
    gulp.watch("index.html").on('change', browserSync.reload);
}

// Define public tasks
gulp.task('browser-sync', browserSyncTask);
gulp.task('build', build);
gulp.task('serve', gulp.series('build', 'browser-sync', serve));

// Default task
gulp.task('default', gulp.series('build'));