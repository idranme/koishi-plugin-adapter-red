import { readFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { resolve, join } from 'path'
import { exec } from 'child_process'
import { unlink } from 'fs'
import { tmpdir } from 'os'
import { writeFile } from 'fs'

const TMP_DIR = tmpdir()
const NOOP = () => { }

function saveTmp(data: Buffer, ext?: string): string {
    ext = ext ? '.' + ext : ''
    const filename = randomUUID({ disableEntropyCache: true }) + ext
    const tmpPath = resolve(TMP_DIR, filename)
    writeFile(tmpPath, data, (err) => {
        if (err) throw err
    })
    return tmpPath
}

export function audioTransPcm(buffer: Buffer, samplingRate = '24000'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const tmpPath = saveTmp(buffer)
        const pcmPath = join(TMP_DIR, randomUUID({ disableEntropyCache: true }))
        exec(`ffmpeg -y -i "${tmpPath}" -ar ${samplingRate} -ac 1 -f s16le "${pcmPath}"`, async () => {
            unlink(tmpPath, NOOP)
            try {
                const pcm = await readFile(pcmPath)
                resolve(pcm)
            } catch {
                reject('音频转码失败, 请确保 ffmpeg 已正确安装, 当前仅支持发送 wav 和 silk 格式的语音')
            } finally {
                unlink(pcmPath, NOOP)
            }
        })
    })
}

export function wavToPcm(input: Uint8Array) {
    const { channelData, sampleRate, numberOfChannels } = decodeWavFile(input)
    const monoData = convertPcmToMono(channelData, numberOfChannels)
    const s16lePcm = f32leToS16lePcm(monoData)
    return {
        data: new Uint8Array(s16lePcm),
        sampleRate
    }
}

function convertPcmToMono(channelData: Float32Array[], numberOfChannels: number): Float32Array {
    // 如果numberOfChannels为1，直接返回channelData[0]作为单声道数据
    if (numberOfChannels === 1) {
        return channelData[0]
    }
    // 否则，创建一个新的Float32Array，长度为channelData[0]的长度
    let monoData = new Float32Array(channelData[0].length)
    // 遍历每个采样点
    for (let i = 0; i < monoData.length; i++) {
        // 初始化一个变量，用于累加多声道数据的值
        let sum = 0
        // 遍历每个声道
        for (let j = 0; j < numberOfChannels; j++) {
            // 将该声道在该采样点的值加到sum上
            sum += channelData[j][i]
        }
        // 将sum除以numberOfChannels，得到平均值，作为单声道数据在该采样点的值
        monoData[i] = sum / numberOfChannels
    }
    // 返回单声道数据
    return monoData
}

function f32leToS16lePcm(input: Float32Array): ArrayBuffer {
    const numberOfFrames = input.length
    const bytesPerSample = Math.ceil(16 / 8)
    const fileLength = numberOfFrames * bytesPerSample
    const arrayBuffer = new ArrayBuffer(fileLength)
    const int16Array = new Int16Array(arrayBuffer)
    for (let offset = 0; offset < numberOfFrames; offset++) {
        const sampleValueFloat = input[offset]
        const sampleValueInt16 = floatToSignedInt16(sampleValueFloat)
        int16Array[offset] = sampleValueInt16
    }
    return arrayBuffer
}

// input: [-1,1] float32
function floatToSignedInt16(v: number): number {
    v *= 32768
    v = ~~v
    return v > 32767 ? 32767 : v
}

/*
console.log(floatToSignedInt16(0.5)); // 输出16384
console.log(floatToSignedInt16(-0.5)); // 输出-16384
console.log(floatToSignedInt16(0.123456789)); // 输出4056
console.log(floatToSignedInt16(-0.987654321)); // 输出-32440
console.log(floatToSignedInt16(1)); // 输出32767
console.log(floatToSignedInt16(-1)); // 输出-32768
*/

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
export function isWavFile(fileData: ArrayBufferView | ArrayBuffer): boolean {
    try {
        const chunks = unpackWavFileChunks(fileData);
        const fmt = decodeFormatChunk(chunks.get("fmt"));
        const data = chunks.get("data");
        void getWavFileType(fmt);
        verifyDataChunkLength(data, fmt);
        return true;
    }
    catch (e) {
        return false;
    }
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
const enum AudioEncoding {
    pcmInt,                                                 // PCM integer
    pcmFloat
}                                              // PCM float
const audioEncodingNames = ["int", "float"];
const enum WavFileType {
    uint8,                                                  // 1-8 bit unsigned integer
    int16,                                                  // 9-16 bit signed integer
    int24,                                                  // 17-24 bit signed integer
    float32
}
const wavFileTypeAudioEncodings = [AudioEncoding.pcmInt, AudioEncoding.pcmInt, AudioEncoding.pcmInt, AudioEncoding.pcmFloat];

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
interface AudioData {
    channelData: Float32Array[];               // arrays containing the audio samples (PCM data), one array per channel
    sampleRate: number;                       // sample rate (samples per second)
    numberOfChannels: number;                       // number of channels, same as channelData.length
    audioEncoding: AudioEncoding;                // audio encoding in the WAV file (PCM integer, PCM float)
    bitsPerSample: number;                       // number of bits per sample in the WAV file
    wavFileTypeName: string;
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function decodeWavFile(fileData: ArrayBufferView | ArrayBuffer): AudioData {
    const chunks = unpackWavFileChunks(fileData);
    const fmt = decodeFormatChunk(chunks.get("fmt"));
    const data = chunks.get("data");
    const wavFileType = getWavFileType(fmt);
    const audioEncoding = wavFileTypeAudioEncodings[wavFileType];
    const audioEncodingName = audioEncodingNames[audioEncoding];
    const wavFileTypeName = audioEncodingName + fmt.bitsPerSample;
    verifyDataChunkLength(data, fmt);
    const channelData = decodeDataChunk(data!, fmt, wavFileType);
    return { channelData, sampleRate: fmt.sampleRate, numberOfChannels: fmt.numberOfChannels, audioEncoding, bitsPerSample: fmt.bitsPerSample, wavFileTypeName };
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function unpackWavFileChunks(fileData: ArrayBufferView | ArrayBuffer): Map<string, DataView> {
    let dataView: DataView;
    if (fileData instanceof ArrayBuffer) {
        dataView = new DataView(fileData);
    }
    else {
        dataView = new DataView(fileData.buffer, fileData.byteOffset, fileData.byteLength);
    }
    const fileLength = dataView.byteLength;
    if (fileLength < 20) {
        throw new Error("WAV file is too short.");
    }
    if (getString(dataView, 0, 4) != "RIFF") {
        throw new Error("Not a valid WAV file (no RIFF header).");
    }
    const mainChunkLength = dataView.getUint32(4, true);
    if (8 + mainChunkLength != fileLength) {
        throw new Error(`Main chunk length of WAV file (${8 + mainChunkLength}) does not match file size (${fileLength}).`);
    }
    if (getString(dataView, 8, 4) != "WAVE") {
        throw new Error("RIFF file is not a WAV file.");
    }
    const chunks = new Map<string, DataView>();
    let fileOffset = 12;
    while (fileOffset < fileLength) {
        if (fileOffset + 8 > fileLength) {
            throw new Error(`Incomplete chunk prefix in WAV file at offset ${fileOffset}.`);
        }
        const chunkId = getString(dataView, fileOffset, 4).trim();
        const chunkLength = dataView.getUint32(fileOffset + 4, true);
        if (fileOffset + 8 + chunkLength > fileLength) {
            throw new Error(`Incomplete chunk data in WAV file at offset ${fileOffset}.`);
        }
        const chunkData = new DataView(dataView.buffer, dataView.byteOffset + fileOffset + 8, chunkLength);
        chunks.set(chunkId, chunkData);
        const padLength = (chunkLength % 2);
        fileOffset += 8 + chunkLength + padLength;
    }
    return chunks;
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function getString(dataView: DataView, offset: number, length: number): string {
    const a = new Uint8Array(dataView.buffer, dataView.byteOffset + offset, length);
    return <string>String.fromCharCode.apply(null, a);
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function getInt24(dataView: DataView, offset: number): number {
    const b0 = dataView.getInt8(offset + 2) * 0x10000;
    const b12 = dataView.getUint16(offset, true);
    return b0 + b12;
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
interface FormatChunk {
    formatCode: number;                       // 1 = WAVE_FORMAT_PCM, 3 = WAVE_FORMAT_IEEE_FLOA
    numberOfChannels: number;                       // number of channels
    sampleRate: number;                       // sample rate
    bytesPerSec: number;                       // data rate
    bytesPerFrame: number;                       // number of bytes per frame (= numberOfChannels * bytesPerSample)
    bitsPerSample: number;
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function decodeFormatChunk(dataView?: DataView): FormatChunk {
    if (!dataView) {
        throw new Error("No format chunk found in WAV file.");
    }
    if (dataView.byteLength < 16) {
        throw new Error("Format chunk of WAV file is too short.");
    }
    const fmt = <FormatChunk>{};
    fmt.formatCode = dataView.getUint16(0, true);    // wFormatTag
    fmt.numberOfChannels = dataView.getUint16(2, true);    // nChannels
    fmt.sampleRate = dataView.getUint32(4, true);    // nSamplesPerSec
    fmt.bytesPerSec = dataView.getUint32(8, true);    // nAvgBytesPerSec
    fmt.bytesPerFrame = dataView.getUint16(12, true);    // nBlockAlign
    fmt.bitsPerSample = dataView.getUint16(14, true);    // wBitsPerSample
    return fmt;
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function getWavFileType(fmt: FormatChunk): WavFileType {
    if (fmt.numberOfChannels < 1 || fmt.numberOfChannels > 999) {
        throw new Error("Invalid number of channels in WAV file.");
    }
    const bytesPerSample = Math.ceil(fmt.bitsPerSample / 8);
    const expectedBytesPerFrame = fmt.numberOfChannels * bytesPerSample;
    if (fmt.formatCode == 1 && fmt.bitsPerSample >= 1 && fmt.bitsPerSample <= 8 && fmt.bytesPerFrame == expectedBytesPerFrame) {
        return WavFileType.uint8;
    }
    if (fmt.formatCode == 1 && fmt.bitsPerSample >= 9 && fmt.bitsPerSample <= 16 && fmt.bytesPerFrame == expectedBytesPerFrame) {
        return WavFileType.int16;
    }
    if (fmt.formatCode == 1 && fmt.bitsPerSample >= 17 && fmt.bitsPerSample <= 24 && fmt.bytesPerFrame == expectedBytesPerFrame) {
        return WavFileType.int24;
    }
    if (fmt.formatCode == 3 && fmt.bitsPerSample == 32 && fmt.bytesPerFrame == expectedBytesPerFrame) {
        return WavFileType.float32;
    }
    throw new Error(`Unsupported WAV file type, formatCode=${fmt.formatCode}, bitsPerSample=${fmt.bitsPerSample}, bytesPerFrame=${fmt.bytesPerFrame}, numberOfChannels=${fmt.numberOfChannels}.`);
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function decodeDataChunk(data: DataView, fmt: FormatChunk, wavFileType: WavFileType): Float32Array[] {
    switch (wavFileType) {
        case WavFileType.uint8: return decodeDataChunk_uint8(data, fmt);
        case WavFileType.int16: return decodeDataChunk_int16(data, fmt);
        case WavFileType.int24: return decodeDataChunk_int24(data, fmt);
        case WavFileType.float32: return decodeDataChunk_float32(data, fmt);
        default: throw new Error("No decoder.");
    }
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function decodeDataChunk_int16(data: DataView, fmt: FormatChunk): Float32Array[] {
    const channelData = allocateChannelDataArrays(data.byteLength, fmt);
    const numberOfChannels = fmt.numberOfChannels;
    const numberOfFrames = channelData[0].length;
    let offs = 0;
    for (let frameNo = 0; frameNo < numberOfFrames; frameNo++) {
        for (let channelNo = 0; channelNo < numberOfChannels; channelNo++) {
            const sampleValueInt = data.getInt16(offs, true);
            const sampleValueFloat = sampleValueInt / 0x8000;
            channelData[channelNo][frameNo] = sampleValueFloat;
            offs += 2;
        }
    }
    return channelData;
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function decodeDataChunk_uint8(data: DataView, fmt: FormatChunk): Float32Array[] {
    const channelData = allocateChannelDataArrays(data.byteLength, fmt);
    const numberOfChannels = fmt.numberOfChannels;
    const numberOfFrames = channelData[0].length;
    let offs = 0;
    for (let frameNo = 0; frameNo < numberOfFrames; frameNo++) {
        for (let channelNo = 0; channelNo < numberOfChannels; channelNo++) {
            const sampleValueInt = data.getUint8(offs);
            const sampleValueFloat = (sampleValueInt - 0x80) / 0x80;
            channelData[channelNo][frameNo] = sampleValueFloat;
            offs += 1;
        }
    }
    return channelData;
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function decodeDataChunk_int24(data: DataView, fmt: FormatChunk): Float32Array[] {
    const channelData = allocateChannelDataArrays(data.byteLength, fmt);
    const numberOfChannels = fmt.numberOfChannels;
    const numberOfFrames = channelData[0].length;
    let offs = 0;
    for (let frameNo = 0; frameNo < numberOfFrames; frameNo++) {
        for (let channelNo = 0; channelNo < numberOfChannels; channelNo++) {
            const sampleValueInt = getInt24(data, offs);
            const sampleValueFloat = sampleValueInt / 0x800000;
            channelData[channelNo][frameNo] = sampleValueFloat;
            offs += 3;
        }
    }
    return channelData;
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function decodeDataChunk_float32(data: DataView, fmt: FormatChunk): Float32Array[] {
    const channelData = allocateChannelDataArrays(data.byteLength, fmt);
    const numberOfChannels = fmt.numberOfChannels;
    const numberOfFrames = channelData[0].length;
    let offs = 0;
    for (let frameNo = 0; frameNo < numberOfFrames; frameNo++) {
        for (let channelNo = 0; channelNo < numberOfChannels; channelNo++) {
            const sampleValueFloat = data.getFloat32(offs, true);
            channelData[channelNo][frameNo] = sampleValueFloat;
            offs += 4;
        }
    }
    return channelData;
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function allocateChannelDataArrays(dataLength: number, fmt: FormatChunk): Float32Array[] {
    const numberOfFrames = Math.floor(dataLength / fmt.bytesPerFrame);
    const channelData: Float32Array[] = new Array(fmt.numberOfChannels);
    for (let channelNo = 0; channelNo < fmt.numberOfChannels; channelNo++) {
        channelData[channelNo] = new Float32Array(numberOfFrames);
    }
    return channelData;
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function verifyDataChunkLength(data: DataView | undefined, fmt: FormatChunk) {
    if (!data) {
        throw new Error("No data chunk found in WAV file.");
    }
    if (data.byteLength % fmt.bytesPerFrame != 0) {
        throw new Error("WAV file data chunk length is not a multiple of frame size.");
    }
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
interface WavFileInfo {
    chunkInfo: ChunkInfoEntry[];
    fmt: FormatChunk;
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
interface ChunkInfoEntry {
    chunkId: string;                       // "fmt", "data", etc.
    dataOffset: number;                       // offset of chunk data in file
    dataLength: number;
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function getWavFileInfo(fileData: ArrayBufferView | ArrayBuffer): WavFileInfo {
    const chunks = unpackWavFileChunks(fileData);
    const chunkInfo = getChunkInfo(chunks);
    const fmt = decodeFormatChunk(chunks.get("fmt"));
    return { chunkInfo, fmt };
}

// forked from https://github.com/chdh/wav-file-decoder/blob/main/src/WavFileDecoder.ts
// MIT license
function getChunkInfo(chunks: Map<string, DataView>): ChunkInfoEntry[] {
    const chunkInfo: ChunkInfoEntry[] = [];
    for (const e of chunks) {
        const ci = <ChunkInfoEntry>{};
        ci.chunkId = e[0];
        ci.dataOffset = e[1].byteOffset;
        ci.dataLength = e[1].byteLength;
        chunkInfo.push(ci);
    }
    chunkInfo.sort((e1, e2) => e1.dataOffset - e2.dataOffset);
    return chunkInfo;
}