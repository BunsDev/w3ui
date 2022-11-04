import { Blob, File } from '@web-std/file'
import { exporter, UnixFSEntry, UnixFSDirectory } from 'ipfs-unixfs-exporter'
import { MemoryBlockstore } from 'blockstore-core/memory'
import path from 'path'
import { encodeFile, encodeDirectory } from '../unixfs'
import { Block } from '@ipld/unixfs'
import * as raw from 'multiformats/codecs/raw'
import { collect } from '../utils'

async function collectDir (dir: UnixFSDirectory): Promise<UnixFSEntry[]> {
  const entries: UnixFSEntry[] = []
  for await (const entry of dir.content()) {
    if (entry.type === 'directory') {
      entries.push(...(await collectDir(entry)))
      continue
    }
    entries.push(entry)
  }
  return entries
}

async function blocksToBlockstore (blocks: Iterable<Block>): Promise<MemoryBlockstore> {
  const blockstore = new MemoryBlockstore()
  for (const block of blocks) {
    // @ts-expect-error https://github.com/ipld/js-unixfs/issues/30
    await blockstore.put(block.cid, block.bytes)
  }
  return blockstore
}

describe('UnixFS CAR encoder', () => {
  it('encodes a file', async () => {
    const file = new Blob(['test'])
    const { cid, blocks } = await encodeFile(file)
    const blockstore = await blocksToBlockstore(blocks)
    const entry = await exporter(cid.toString(), blockstore)
    const out = new Blob(await collect(entry.content()))
    expect(await out.text()).toEqual(await file.text())
  })

  it('encodes a directory', async () => {
    const files = [
      new File(['top level'], 'aaaaa.txt'),
      new File(['top level dot prefix'], './bbb.txt'),
      new File(['top level slash prefix'], '/c.txt'),
      new File(['in a dir'], 'dir/two.txt'),
      new File(['another in a dir'], 'dir/three.txt'),
      new File(['in deeper in dir'], 'dir/deeper/four.png'),
      new File(['back in the parent'], 'dir/five.pdf'),
      new File(['another in the child'], 'dir/deeper/six.mp4')
    ]

    const { cid, blocks } = await encodeDirectory(files)
    const blockstore = await blocksToBlockstore(blocks)
    const dirEntry = await exporter(cid.toString(), blockstore)
    expect(dirEntry).toHaveProperty('type', 'directory')

    const expectedPaths = files.map(f => path.join((cid).toString(), f.name))
    const entries = await collectDir(dirEntry as UnixFSDirectory)
    const actualPaths = entries.map(e => e.path)

    expectedPaths.forEach(p => expect(actualPaths).toContain(p))
  })

  it('configured to use raw leaves', async () => {
    const file = new Blob(['test'])
    const { cid } = await encodeFile(file)
    expect(cid.code).toEqual(raw.code)
  })
})