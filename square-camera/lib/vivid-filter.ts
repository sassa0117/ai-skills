/**
 * ビビッドフィルター（彩度+明るさブースト）
 * expo-gl GLSLシェーダー処理
 */
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";

const VERT = `
attribute vec2 aPos;
varying vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
varying vec2 vUV;
uniform sampler2D uTex;

const float SATURATION = 1.4;
const float BRIGHTNESS = 1.12;
const float CONTRAST = 1.05;

void main() {
  vec4 c = texture2D(uTex, vec2(vUV.x, 1.0 - vUV.y));
  float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 sat = mix(vec3(luma), c.rgb, SATURATION);
  vec3 bright = sat * BRIGHTNESS;
  vec3 con = (bright - 0.5) * CONTRAST + 0.5;
  gl_FragColor = vec4(clamp(con, 0.0, 1.0), c.a);
}
`;

export async function applyVividFilter(imageUri: string): Promise<string> {
  const gl = (await GLView.createContextAsync()) as ExpoWebGLRenderingContext;

  try {
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERT);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FRAG);
    gl.compileShader(fs);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE,
      { localUri: imageUri } as any
    );
    gl.uniform1i(gl.getUniformLocation(prog, "uTex"), 0);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.flush();
    gl.endFrameEXP();

    const result = await GLView.takeSnapshotAsync(gl as any, {
      format: "jpeg" as any,
      compress: 0.92,
    });

    gl.deleteTexture(tex);
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return result.uri;
  } catch (e) {
    console.warn("Vivid filter failed:", e);
    return imageUri;
  }
}
