import assert from "node:assert/strict"
import test from "node:test"

import {
  clampPage,
  DEFAULT_WORK_ORDER_PAGE_SIZE,
  getTotalPages,
  paginateItems,
} from "../pagination"

test("work order pagination uses twenty items per page by default", () => {
  const items = Array.from({ length: 45 }, (_, index) => index + 1)

  assert.equal(DEFAULT_WORK_ORDER_PAGE_SIZE, 20)
  assert.deepEqual(paginateItems(items, 1), items.slice(0, 20))
  assert.deepEqual(paginateItems(items, 2), items.slice(20, 40))
  assert.deepEqual(paginateItems(items, 3), items.slice(40, 45))
})

test("pagination clamps invalid and out-of-range pages", () => {
  const items = Array.from({ length: 25 }, (_, index) => index + 1)

  assert.equal(getTotalPages(items.length), 2)
  assert.equal(clampPage(0, items.length), 1)
  assert.equal(clampPage(99, items.length), 2)
  assert.deepEqual(paginateItems(items, 99), items.slice(20, 25))
})

test("empty results still expose a stable first page", () => {
  assert.equal(getTotalPages(0), 1)
  assert.equal(clampPage(5, 0), 1)
  assert.deepEqual(paginateItems([], 1), [])
})
