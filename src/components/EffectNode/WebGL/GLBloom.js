import * as THREE from 'three'
import { MeshStandardMaterial } from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass'
export class GLBloom {
  constructor ({ ctx }) {
    ctx.link(this)

    var params = {
      starBloomBase: 1.5,

      bloomThreshold: 0.7,
      bloomStrength: 1.2,
      bloomRadius: 0.5
    };

    ctx.onLoop(() => {
      let time = window.performance.now() * 0.009
      // params.bloomThreshold = 0.5 + Math.sin(time) * -0.5
      params.bloomStrength = params.starBloomBase + Math.sin(time) * 0.5
      params.bloomStrength *= 0.7
    })

    let { renderer, camera, scene } = ctx
    let rect = renderer.domElement.getBoundingClientRect()

    let dpi = window.devicePixelRatio || 1.0
    // let rttA = new THREE.WebGLRenderTarget(rect.width, rect.height, { encoding: THREE.sRGBEncoding })
    let rttA = new THREE.WebGLRenderTarget(rect.width * dpi, rect.height * dpi)
    let bloomPass = new UnrealBloomPass(new THREE.Vector2(rect.width * 0.75, rect.height * 0.75), 1.5, 0.4, 0.85 );
    bloomPass.threshold = params.bloomThreshold;
    bloomPass.strength = params.bloomStrength;
    bloomPass.radius = params.bloomRadius;
    bloomPass.renderToScreen = false

    ctx.onResize(() => {
      rect = renderer.domElement.getBoundingClientRect()
      rttA.setSize(rect.width * dpi, rect.height * dpi)
      bloomPass.setSize(rect.width * 0.75, rect.height * 0.75)
    })

    ctx.onLoop(() => {
      bloomPass.threshold = params.bloomThreshold
      bloomPass.strength = params.bloomStrength
      bloomPass.radius = params.bloomRadius
    })

    let glsl = (v, ...args) => {
      let str = ''
      v.forEach((e, i) => {
        str += e + (args[i] || '')
      })
      return str
    }

    let planeGeo = new THREE.PlaneBufferGeometry(2, 2, 2, 2)
    let planeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        rtt: { value: rttA.texture }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: glsl`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: glsl`
        varying vec2 vUv;
        uniform sampler2D rtt;
        void main() {
          vec4 rttColor = texture2D(rtt, vUv);
          gl_FragColor = vec4(rttColor);
        }
      `
    })
    let bloomLayerMesh = new THREE.Mesh(planeGeo, planeMaterial)
    scene.add(bloomLayerMesh)

    let materialsRestore = new Map()
    let blackColor = new THREE.Color('#000000')
    let getBlackMat = ({ obj }) => {
      let mat = obj.material.clone()
      mat.color = blackColor
      mat.transparent = false
      mat.opacity = 1.0
      if (typeof mat.roughness !== 'undefined') {
        mat.roughness = 0.0
      }
      if (typeof mat.metalness !== 'undefined') {
        mat.metalness = 0.0
      }
      return mat
    }

    let darkenNonBloomed = (obj) => {
      if (obj.material && !obj.userData.bloom && obj.material instanceof MeshStandardMaterial) {
        materialsRestore.set(obj.uuid, obj.material)
        obj.userData.darkMaterial = obj.userData.darkMaterial || getBlackMat({ obj })
        obj.material = obj.userData.darkMaterial
      }

      // if (obj.userData && obj.userData.invisible === true) {
      //   if (obj.material && obj.material.uniforms && obj.material.uniforms.masterOpacity) {
      //     obj.material.uniforms.masterOpacity.value = 0.0
      //   }
      // }
    }

    let restoreMaterial = (obj) => {
      if (materialsRestore.has(obj.uuid)) {
        obj.material = materialsRestore.get(obj.uuid);
        obj.material.needsUpdate = true
        materialsRestore.delete(obj.uuid)
      }

      // if (obj.userData && obj.userData.invisible === true) {
      //   if (obj.material && obj.material.uniforms && obj.material.uniforms.masterOpacity) {
      //     obj.material.uniforms.masterOpacity.value = 1.0
      //   }
      // }
    }

    this.selectiveBloom = () => {
      renderer.setRenderTarget(null)
      // animation code (make the model move)
      renderer.clearDepth()

      // ------
      bloomLayerMesh.visible = false
      ctx.scene.environment = null
      ctx.scene.traverse(darkenNonBloomed)

      ///
      renderer.setRenderTarget(rttA)
      renderer.clear(true, true, true)
      renderer.render(scene, camera)

      let readBuffer = rttA
      let writeBuffer = null // dont need write buffer, please read ureal bloom threejs
      let deltaTime = 0
      let maskActive = false
      bloomPass.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
      ///

      ctx.scene.traverse(restoreMaterial)
      ctx.scene.environment = window.origEnvMap

      renderer.setRenderTarget(null)
      bloomLayerMesh.visible = true

      // -------
      renderer.render(scene, camera)
    }
  }
}