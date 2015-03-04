/**
 * dat.globe Javascript WebGL Globe Toolkit
 * http://dataarts.github.com/dat.globe
 *
 * Copyright 2011 Data Arts Team, Google Creative Lab
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

var DAT = DAT || {};

// Used with the colour function (each subarray is an RGB tuple representing
// the percentage out of 255)
var COLOURS = [
  [  0,   0, 1.0], // blue
  [  0, 1.0,   0], // green
  [1.0, 1.0,   0], // yellow
  [1.0,   0,   0]  // red
];

// Also used with the colour function
var _maxDataVal = 0;

DAT.Globe = function(container, backgroundTexture) {

  // Logic for this function inspired by:
  // http://www.andrewnoske.com/wiki/Code_-_heatmaps_and_color_gradients
  var colorFn =  function(x) {
    var idx1, idx2, fractBetween, r, g, b;

    x = x / _maxDataVal;

    fractBetween = 0;
    if( x <= 0 ) {
      idx1 = 0;
      idx2 = 0;
    } else if( x >= 1 ) {
      idx1 = COLOURS.length - 1;
      idx2 = COLOURS.length - 1;
    } else {
      x = x * (COLOURS.length-1);
      idx1 = Math.floor( x );
      idx2 = idx1 + 1;
      fractBetween = x - idx1;
    }

    r = ( COLOURS[idx2][0] - COLOURS[idx1][0] ) * fractBetween + COLOURS[idx1][0];
    g = ( COLOURS[idx2][1] - COLOURS[idx1][1] ) * fractBetween + COLOURS[idx1][1];
    b = ( COLOURS[idx2][2] - COLOURS[idx1][2] ) * fractBetween + COLOURS[idx1][2];

    return new THREE.Color( r*255, g*255, b*255 );
  };

  var Shaders = {
    'earth' : {
      uniforms: {
        'texture': { type: 't', value: null }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'varying vec2 vUv;',
        'void main() {',
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
          'vNormal = normalize( normalMatrix * normal );',
          'vUv = uv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D texture;',
        'varying vec3 vNormal;',
        'varying vec2 vUv;',
        'void main() {',
          'vec3 diffuse = texture2D( texture, vUv ).xyz;',
          'float intensity = 1.05 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) );',
          'vec3 atmosphere = vec3( 1.0, 1.0, 1.0 ) * pow( intensity, 3.0 );',
          'gl_FragColor = vec4( diffuse + atmosphere, 1.0 );',
        '}'
      ].join('\n')
    },
    'atmosphere' : {
      uniforms: {},
      vertexShader: [
        'varying vec3 vNormal;',
        'void main() {',
          'vNormal = normalize( normalMatrix * normal );',
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vNormal;',
        'void main() {',
          'float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 );',
          'gl_FragColor = vec4( 0.5, 0.5, 0.5, 0.25 ) * intensity;',
        '}'
      ].join('\n')
    }
  };

  var camera, scene, renderer, w, h;
  var mesh, atmosphere, point;

  var overRenderer;

  var curZoomSpeed = 0;
  var zoomSpeed = 50;

  var mouse = { x: 0, y: 0 }, mouseOnDown = { x: 0, y: 0 };
  var rotation = { x: 0, y: 0 },
      target = { x: Math.PI*1.7, y: Math.PI / 5.0 },
      targetOnDown = { x: 0, y: 0 };

  var distance = 100000, distanceTarget = 100000;
  var padding = 40;
  var PI_HALF = Math.PI / 2;

  var ROTATIONSPEED = 0.003;
  var k = ROTATIONSPEED;
  var f = false;

  function init() {

    container.style.color = '#fff';
    container.style.font = '13px/20px Arial, sans-serif';

    var shader, uniforms, material;
    w = container.offsetWidth || window.innerWidth;
    h = container.offsetHeight || window.innerHeight;


    camera = new THREE.PerspectiveCamera(26, w / h, 1, 10000);
    camera.position.z = distance;

    scene = new THREE.Scene();

    var geometry = new THREE.SphereGeometry(150, 40, 30);

    shader = Shaders.earth;
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    THREE.ImageUtils.crossOrigin = '';
    uniforms.texture.value = backgroundTexture;

    material = new THREE.ShaderMaterial({

          uniforms: uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader

        });

    mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.y = Math.PI;
    scene.add(mesh);

    shader = Shaders.atmosphere;
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    material = new THREE.ShaderMaterial({

          uniforms: uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          transparent: true

        });

    mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set( 1.1, 1.1, 1.1 );
    scene.add(mesh);

    geometry = new THREE.BoxGeometry(0.75, 0.75, 1);
    geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0,0,-0.5));

    point = new THREE.Mesh(geometry);

    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(w, h);

    renderer.domElement.style.position = 'absolute';

    container.appendChild(renderer.domElement);

    container.addEventListener('mousedown', onMouseDown, false);

    container.addEventListener('mousewheel', onMouseWheel, false);
    // firefox mouse wheel handler
    container.addEventListener( 'DOMMouseScroll', function(e) {
      var evt = window.event || e;
      onMouseWheel( evt );
    }, false );

    document.addEventListener('keydown', onDocumentKeyDown, false);

    //window.addEventListener('resize', onWindowResize, false);

    container.addEventListener('mouseover', function() {
      overRenderer = true;
    }, false);

    container.addEventListener('mouseout', function() {
      overRenderer = false;
    }, false);
  }

  addData = function(data) {
    var lat, lng, size, color, colorFnWrapper;

    // get ready for our colour function
    _setMaxDataVal( data );

    colorFnWrapper = function(data, i) { return colorFn(data[i+2]); };

    var subgeo = new THREE.Geometry();

    data.forEach( function( series ) {
      for( var i = 0; i < series[1].length; i += 3 ) {
        lat = series[1][i];
        lng = series[1][i + 1];
        color = colorFnWrapper(series[1],i);
        size = 0;
        addPoint(lat, lng, size, color, subgeo);
      }
    });
    this._baseGeometry = subgeo;
  };

  function createPoints() {
    if (this._baseGeometry !== undefined) {
      this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
            color: 0xffffff,
            vertexColors: THREE.FaceColors,
            morphTargets: false
      }));
      scene.add(this.points);
    }
  }

  function addPoint(lat, lng, size, color, subgeo) {

    var phi = (90 - lat) * Math.PI / 180;
    var theta = (180 - lng) * Math.PI / 180;

    point.position.x = 150 * Math.sin(phi) * Math.cos(theta);
    point.position.y = 150 * Math.cos(phi);
    point.position.z = 150 * Math.sin(phi) * Math.sin(theta);

    point.lookAt(mesh.position);

    point.scale.z = Math.max( size, 0.1 ); // avoid non-invertible matrix
    point.updateMatrix();

    for (var i = 0; i < point.geometry.faces.length; i++) {

      point.geometry.faces[i].color = color;

    }

    // Note: this method was introduced in r70 but is only documented in the
    // release notes. Hopefully it will stick around and not break in the future
    subgeo.mergeMesh( point );
  }

  function onMouseDown(event) {
    event.preventDefault();

    k = 0;
    f = true;

    container.addEventListener('mousemove', onMouseMove, false);
    container.addEventListener('mouseup', onMouseUp, false);
    container.addEventListener('mouseout', onMouseOut, false);

    target.y = rotation.y;

    mouseOnDown.x = - event.clientX;
    mouseOnDown.y = event.clientY;

    targetOnDown.x = target.x;
    targetOnDown.y = target.y;

    container.style.cursor = 'move';
  }

  function onMouseMove(event) {
    mouse.x = - event.clientX;
    mouse.y = event.clientY;

    var zoomDamp = distance/1000;

    target.x = targetOnDown.x + (mouse.x - mouseOnDown.x) * 0.005 * zoomDamp;
    target.y = targetOnDown.y + (mouse.y - mouseOnDown.y) * 0.005 * zoomDamp;

    target.y = target.y > PI_HALF ? PI_HALF : target.y;
    target.y = target.y < - PI_HALF ? - PI_HALF : target.y;
  }

  function onMouseUp(event) {

    k = ROTATIONSPEED;
    f = false;

    container.removeEventListener('mousemove', onMouseMove, false);
    container.removeEventListener('mouseup', onMouseUp, false);
    container.removeEventListener('mouseout', onMouseOut, false);
    container.style.cursor = 'auto';
  }

  function onMouseOut(event) {

    k = ROTATIONSPEED;
    f = false;

    container.removeEventListener('mousemove', onMouseMove, false);
    container.removeEventListener('mouseup', onMouseUp, false);
    container.removeEventListener('mouseout', onMouseOut, false);
  }

  function onMouseWheel(event) {
    event.preventDefault();
    if (overRenderer) {
      var delta = 0;
      if( event.wheelDelta ) {
        delta = event.wheelDelta * 0.3;
      } else if( event.detail ) {
        delta = -event.detail * 10;
      }

      zoom(delta);
    }
    return false;
  }

  function onDocumentKeyDown(event) {
    switch (event.keyCode) {
      case 38:
        zoom(100);
        event.preventDefault();
        break;
      case 40:
        zoom(-100);
        event.preventDefault();
        break;
    }
  }

  function onWindowResize( event ) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
  }

  function zoom(delta) {
    distanceTarget -= delta;
    distanceTarget = distanceTarget > 1100 ? 1100 : distanceTarget;
    distanceTarget = distanceTarget < 350 ? 350 : distanceTarget;
  }

  function animate() {
    requestAnimationFrame(animate);
    render();

  }



  function render() {
    zoom(curZoomSpeed);

    target.x -= k;

    rotation.x += (target.x - rotation.x) * 0.2;

    if (f === true){
      rotation.y += (target.y - rotation.y) * 0.2;}
    if (f === false){
      target.y = Math.PI / 5.0;
      rotation.y += (target.y - rotation.y) * 0.02;
    }

    distance += (distanceTarget - distance) * 0.3;

    camera.position.x = distance * Math.sin(rotation.x) * Math.cos(rotation.y);
    camera.position.y = distance * Math.sin(rotation.y);
    camera.position.z = distance * Math.cos(rotation.x) * Math.cos(rotation.y);

    camera.lookAt(mesh.position);

    renderer.render(scene, camera);

  }

  init();
  this.animate = animate;


  this.__defineGetter__('time', function() {
    return this._time || 0;
  });

  this.__defineSetter__('time', function(t) {
    var validMorphs = [];
    var morphDict = this.points.morphTargetDictionary;
    for(var k in morphDict) {
      if(k.indexOf('morphPadding') < 0) {
        validMorphs.push(morphDict[k]);
      }
    }
    validMorphs.sort();
    var l = validMorphs.length-1;
    var scaledt = t*l+1;
    var index = Math.floor(scaledt);
    for (i=0;i<validMorphs.length;i++) {
      this.points.morphTargetInfluences[validMorphs[i]] = 0;
    }
    var lastIndex = index - 1;
    var leftover = scaledt - index;
    if (lastIndex >= 0) {
      this.points.morphTargetInfluences[lastIndex] = 1 - leftover;
    }
    this.points.morphTargetInfluences[index] = leftover;
    this._time = t;
  });

  this.addData = addData;
  this.createPoints = createPoints;
  this.renderer = renderer;
  this.scene = scene;

  return this;

};

// helper function to find the max value in an array of data (used for colour
// interpolation in the colorFn)
var _setMaxDataVal = function( data, format ) {
  var series = [];
  data.forEach( function( subArr ) {
    series.push( Math.max.apply( Math, subArr[1] ) );
  });

  _maxDataVal = Math.max.apply( Math, series );
};
