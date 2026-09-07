import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { net } from 'electron'
import type {
  GamebananaAlternateSourceDto,
  GamebananaCommentDto,
  GamebananaFileDto,
  GamebananaRequirementDto,
  GamebananaSearchResult,
  GamebananaSubmissionDto
} from '../../shared/types'
import { BALDI_COMMUNITY_CATEGORY_ID } from '../../shared/types'
import { debugLog } from '../logger'



const API_BASE = 'https://gamebanana.com/apiv12/'
const SITE_BASE = 'https://gamebanana.com'

const PAGE_SIZE = 50


const USER_AGENT = "GottaManageDev/0.1.0 (mod manager for Baldi's Basics Plus; electron)"



const BLOCKED_MOD_IDS = new Set<number>([675111])

type Json = Record<string, unknown>

function ok(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : fallback
  return Number.isFinite(n) ? n : fallback
}

function asStr(v: unknown, fallback = ''): string {
  return v === undefined || v === null ? fallback : String(v)
}


function absoluteUrl(u: string): string {
  if (!u) return u
  return u.startsWith('http') ? u : u.startsWith('/') ? SITE_BASE + u : u
}


function resolveLink(cloaked: string): string {
  if (!cloaked) return cloaked
  if (/\/\/gamebanana\.com\/linkfilter/i.test(cloaked)) {
    try {
      const q = new URL(cloaked).searchParams.get('url')
      if (q) return q
    } catch {
      
    }
  }
  return cloaked
}


function extractGamebananaId(u: string | undefined): number | undefined {
  if (!u) return undefined
  const real = resolveLink(u)
  const m = /\/mods\/0*(\d+)/i.exec(real)
  if (!m) return undefined
  const id = Number(m[1])
  return Number.isFinite(id) && id > 0 ? id : undefined
}


function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}


function singleImageUrl(img: unknown): string | undefined {
  if (!ok(img)) return undefined
  const base = asStr(img['_sBaseUrl']).replace(/\/+$/, '')
  if (!base) return undefined
  const fileName =
    asStr(img['_sFile530']) || asStr(img['_sFile']) || asStr(img['_sFile100'])
  return fileName ? `${base}/${fileName}` : undefined
}

function parseThumb(media: unknown): string | undefined {
  if (!ok(media)) return undefined
  const images = media['_aImages']
  if (!Array.isArray(images) || images.length === 0) return undefined
  return singleImageUrl(images[0])
}


function parseAllImages(media: unknown): string[] {
  if (!ok(media)) return []
  const images = media['_aImages']
  if (!Array.isArray(images)) return []
  const out: string[] = []
  for (const img of images) {
    const u = singleImageUrl(img)
    if (u && !out.includes(u)) out.push(u)
  }
  return out
}


function parseFileVersion(desc: string): string | undefined {
  if (!desc) return undefined
  
  const m = /\(([^)]+)\)\s*$/.exec(desc) ?? /\(([^)]+)\)/.exec(desc)
  if (!m) return undefined
  const v = m[1].trim()
  return v || undefined
}

function parseFiles(node: unknown): GamebananaFileDto[] {
  const out: GamebananaFileDto[] = []
  const push = (arr: unknown): void => {
    if (!Array.isArray(arr)) return
    for (const it of arr) {
      if (!ok(it)) continue
      const desc = asStr(it['_sDescription'])
      const fileSize = asNum(it['_nFilesize'])
      out.push({
        id: asNum(it['_idRow']),
        fileName: asStr(it['_sFile']),
        fileSize,
        downloadUrl: absoluteUrl(asStr(it['_sDownloadUrl'])),
        description: desc || undefined,
        version: parseFileVersion(desc),
        dateAdded: asNum(it['_tsDateAdded']) || undefined
      })
    }
  }
  push(node)
  return out.filter((f) => f.downloadUrl)
}





async function request(
  url: string,
  init: { headers?: Record<string, string>; signal?: AbortSignal }
): Promise<Response> {
  
  for (let attempt = 0; ; attempt++) {
    try {
      let res: Response | undefined
      if (net.isOnline?.()) {
        try {
          res = await net.fetch(url, {
            headers: init.headers,
            redirect: 'follow',
            signal: init.signal
          })
        } catch {
          
        }
      }
      if (!res) res = await fetch(url, { headers: init.headers, redirect: 'follow', signal: init.signal })
      return res
    } catch (err) {
      const aborted = init.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')
      if (aborted || attempt >= 2) throw err
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
    }
  }
}

async function getJson(url: string): Promise<Json> {
  const res = await request(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
  })
  if (!res.ok) {
    throw new Error(`GameBanana API ${res.status}: ${res.statusText}`)
  }
  return (await res.json()) as Json
}






export async function searchMods(
  page: number,
  query?: string,
  category?: number
): Promise<GamebananaSearchResult> {
  const q = query ? query.trim() : ''
  const categoryId = category && category > 0 ? category : BALDI_COMMUNITY_CATEGORY_ID
  const filters: string[] = [`_aFilters[Generic_Category]=${categoryId}`]
  if (q) filters.push(`_aFilters[Generic_Name]=contains,${encodeURIComponent(q)}`)
  const url =
    `${API_BASE}Mod/Index?_nPerpage=${PAGE_SIZE}` +
    `&${filters.join('&')}&_nPage=${Math.max(1, page)}`
  debugLog('searchMods url =', url)

  const doc = await getJson(url)
  const records = doc['_aRecords']
  const items: GamebananaSubmissionDto[] = []
  if (Array.isArray(records)) {
    for (const r of records) {
      if (!ok(r)) continue
      const id = asNum(r['_idRow'])
      
      if (BLOCKED_MOD_IDS.has(id)) continue
      const preview = r['_aPreviewMedia']
      const submitter = ok(r['_aSubmitter']) ? r['_aSubmitter'] : undefined
      const category = ok(r['_aCategory']) ? r['_aCategory'] : undefined
      items.push({
        id,
        name: asStr(r['_sName']),
        version: asStr(r['_sVersion']) || undefined,
        authorName: ok(submitter) ? asStr(submitter['_sName']) || undefined : undefined,
        hasFiles: r['_bHasFiles'] === true,
        categoryId: category ? asNum(category['_idRow']) || undefined : undefined,
        thumbnailUrl: parseThumb(preview),
        
        viewCount: asNum(r['_nViewCount']) || undefined,
        dateAdded: asNum(r['_tsDateAdded']) || undefined,
        dateUpdated: asNum(r['_tsDateModified']) || asNum(r['_tsDateUpdated']) || undefined,
        files: []
      })
    }
  }

  
  await Promise.allSettled(
    items.map(async (it) => {
      try {
        const doc = await getJson(API_BASE + 'Mod/' + it.id + '/ProfilePage')
        it.downloadCount = asNum(doc['_nDownloadCount']) || undefined
      } catch {
        
      }
    })
  )

  const meta = ok(doc['_aMetadata']) ? doc['_aMetadata'] : undefined
  const recordCount = meta ? asNum(meta['_nRecordCount']) : items.length
  return {
    recordCount,
    isComplete: meta ? meta['_bIsComplete'] === true : items.length < PAGE_SIZE,
    perPage: meta ? asNum(meta['_nPerpage'], PAGE_SIZE) : PAGE_SIZE,
    items
  }
}






function parseRequirements(raw: unknown): GamebananaRequirementDto[] {
  if (!Array.isArray(raw)) return []
  const out: GamebananaRequirementDto[] = []
  for (const item of raw) {
    
    const entry = Array.isArray(item)
      ? item
      : ok(item) && Array.isArray(item['value'])
        ? (item['value'] as unknown[])
        : null
    if (!entry || entry.length === 0) continue
    const name = asStr(entry[0])
    if (!name) continue
    
    const origUrl = asStr(entry[1]) || undefined
    const url = origUrl ? absoluteUrl(resolveLink(origUrl)) : undefined
    const status = asStr(entry[2]) || undefined
    const reqLevel = asStr(entry[4]) || ''
    out.push({
      name,
      url,
      status,
      required: /required/i.test(reqLevel),
      gamebananaId: extractGamebananaId(origUrl)
    })
  }
  return out
}


function parseAlternateFileSources(raw: unknown): GamebananaAlternateSourceDto[] {
  if (!Array.isArray(raw)) return []
  const out: GamebananaAlternateSourceDto[] = []
  for (const src of raw) {
    if (!ok(src)) continue
    const origUrl = asStr(src['url'])
    if (!origUrl) continue
    const real = resolveLink(origUrl)
    out.push({
      url: absoluteUrl(real),
      description: asStr(src['description']) || undefined,
      host: hostOf(real)
    })
  }
  return out
}





export async function getSubmission(
  id: number
): Promise<GamebananaSubmissionDto> {
  if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid submission id')
  const doc = await getJson(`${API_BASE}Mod/${id}/ProfilePage`)
  debugLog('getSubmission id =', id, 'name =', asStr(doc['_sName']), 'categoryId =', ok(doc['_aCategory']) ? asNum(doc['_aCategory']['_idRow']) : 'n/a')

  
  const files = parseFiles(doc['_aFiles'])
  const archivedFiles = parseFiles(doc['_aArchivedFiles'])
  const submitter = ok(doc['_aSubmitter']) ? doc['_aSubmitter'] : undefined
  
  const primaryDl = absoluteUrl(asStr(doc['_sDownloadUrl']))
  if (primaryDl && !files.some((f) => f.downloadUrl === primaryDl)) {
    files.unshift({ id: -1, fileName: asStr(doc['_sName']) + '.zip', fileSize: 0, downloadUrl: primaryDl })
  }

  const images = parseAllImages(doc['_aPreviewMedia'])
  const category = ok(doc['_aCategory']) ? doc['_aCategory'] : undefined
  return {
    id: asNum(doc['_idRow'], id),
    name: asStr(doc['_sName']),
    
    description: asStr(doc['_sText']) || asStr(doc['_sDescription']) || undefined,
    version: asStr(doc['_sVersion']) || undefined,
    authorName: ok(submitter) ? asStr(submitter['_sName']) || undefined : undefined,
    hasFiles: files.length > 0 || archivedFiles.length > 0,
    categoryId: category ? asNum(category['_idRow']) || undefined : undefined,
    thumbnailUrl: images[0] ?? parseThumb(doc['_aPreviewMedia']),
    images,
    downloadCount: asNum(doc['_nDownloadCount']) || undefined,
    viewCount: asNum(doc['_nViewCount']) || undefined,
    dateAdded: asNum(doc['_tsDateAdded']) || undefined,
    dateUpdated: asNum(doc['_tsDateModified']) || asNum(doc['_tsDateUpdated']) || undefined,
    files,
    archivedFiles,
    requirements: parseRequirements(doc['_aRequirements']),
    alternateFileSources: parseAlternateFileSources(doc['_aAlternateFileSources'])
  }
}





export async function getComments(submissionId: number): Promise<GamebananaCommentDto[]> {
  if (!Number.isFinite(submissionId) || submissionId <= 0) return []
  try {
    
    const doc = await getJson(`${API_BASE}Mod/${submissionId}/Posts`)
    const records = doc['_aRecords']
    if (!Array.isArray(records)) return []
    const out: GamebananaCommentDto[] = []
    for (const r of records) {
      const c = parseComment(r)
      if (c) out.push(c)
    }
    return out
  } catch {
    return []
  }
}





export async function getPostReplies(postId: number): Promise<GamebananaCommentDto[]> {
  if (!Number.isFinite(postId) || postId <= 0) return []
  try {
    const doc = await getJson(`${API_BASE}Post/${postId}/Posts?_nPage=1&_nPerpage=20`)
    const records = doc['_aRecords']
    if (!Array.isArray(records)) return []
    const out: GamebananaCommentDto[] = []
    for (const r of records) {
      const c = parseComment(r)
      if (c) out.push(c)
    }
    return out.reverse()
  } catch {
    return []
  }
}


function parseComment(r: unknown): GamebananaCommentDto | null {
  if (!ok(r)) return null
  const poster = ok(r['_aPoster']) ? r['_aPoster'] : undefined
  const ts = asNum(r['_tsDateAdded'])
  return {
    id: asNum(r['_idRow']),
    author: ok(poster) ? asStr(poster['_sName']) || 'Unknown' : 'Unknown',
    body: asStr(r['_sText']),
    date: ts ? new Date(ts * 1000).toLocaleString() : undefined,
    replyCount: asNum(r['_nReplyCount'])
  }
}

export interface DownloadProgress {
  received: number
  total?: number
}





export async function downloadMod(
  downloadUrl: string,
  onProgress?: (p: DownloadProgress) => void,
  isCancelled?: () => boolean
): Promise<string> {
  const res = await request(downloadUrl, {
    headers: { 'User-Agent': USER_AGENT }
  })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status}: ${res.statusText}`)
  }

  const total = res.headers.get('content-length')
  const totalBytes = total ? Number(total) : undefined
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmdl-'))
  const name =
    (downloadUrl.split('/').pop() || 'mod') +
    '-' +
    crypto.randomBytes(4).toString('hex')
  const dest = path.join(tmpDir, name)

  const stream = fs.createWriteStream(dest)
  const reader = res.body.getReader()
  let received = 0
  try {
    for (;;) {
      if (isCancelled?.()) {
        throw new Error('Download cancelled')
      }
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        received += value.byteLength
        if (!stream.write(value)) {
          await new Promise<void>((resolve) => stream.once('drain', () => resolve(undefined)))
        }
        onProgress?.({ received, total: totalBytes })
      }
    }
  } finally {
    reader.releaseLock?.()
    stream.end()
    await new Promise<void>((resolve) => stream.once('finish', () => resolve(undefined)))
  }
  return dest
}