# Correction memory

Enable **Learn my corrections** in Conversation/Gemini settings to retain committed corrections on this device. Enable **Use memory in Gemini** separately to allow relevant vocabulary and examples in cloud expansion requests. Both switches start off. Turning learning off retains existing records; turning cloud use off excludes them from requests. Gemini itself must also be enabled for cloud generation.

## Learning boundary

Editing a candidate opens a tentative phrase with its original text preserved. Spelling and refinement remain tentative until **Use phrase**. A direct replacement in the accepted draft commits at **Use word** (or acceptance of a refinement). These explicit actions emit one correction event with the original and final text. Raw input, unchanged candidates, rejected suggestions, partner transcription, and speech do not populate this store. Undo or Back retracts the correction events that disappear from the composition history. Redoing an old branch does not silently relearn a forgotten record.

Each persisted row is one confirmed correction, with an ID and timestamp. Changed words are derived with a word-level longest common subsequence, preserving the exact new spelling while excluding unchanged neighboring words. Word spelling and capitalization corrections are learned; punctuation-only edits outside words do not create records. There is no extraction of preferences or relationships. The original and corrected sentence provide provenance; raw partner turns are not retained.

Repeated _committed corrections_ contribute frequency. Displaying or retrieving a suggestion never does. Ordinary acceptance of an unchanged expansion does not yet contribute usage statistics.

## Retrieval

For expansion requests, the main process selects words compatible with a current initial, prefix, or locked word. Specific prefixes outrank single initials; direct mentions and lexical overlap with the draft/recent conversation add relevance. Recency (day buckets) and correction count order ties. Seven ranked words plus a reserved place for the newest eligible corrected word keep rare vocabulary visible. Words longer than the input's 60-character constraint limit are excluded.

Examples match the complete constraint sequence or share meaningful context words. Duplicate sentences are removed. Up to three examples and eight words fit within 1,800 JSON characters. This is lexical scoring, not semantic similarity. Examples use the corrected sentence's initials so a deliberately changed initial remains reusable.

The prompt treats memory as quoted supporting data and preserves current constraints. Existing candidate validation and safe publication boundaries still apply. Memory does not edit accepted text or trigger speech. Retrieval does not change records or their counts.

## Storage and deletion

The main process owns `memory.sqlite` in Electron's user-data directory, using built-in `node:sqlite`; no dependency or server is added. Writes are transactional. The file is owner-readable/writable and uses SQLite secure deletion. There is no app-level encryption, cloud backup, or sync, and external OS backups are outside the app's deletion control.

Records persist until explicitly forgotten, with a cap of 2,000 corrections. At the cap, learning reports an error rather than silently discarding older memories. Composition remains available. A storage/read error disables memory contribution until recovery. Editing a record to remove all lexical changes deletes it.

The memory panel opens to an alphabetical **Vocabulary** view with case/Unicode-normalized duplicates grouped, a count of confirmed source corrections, a word filter, and dwell-accessible pages of 12 words. Each word has its own **Forget** action. The **Corrections** view reviews one correction at a time with dwell controls. Users can compose a replacement with Dasher and choose **Replace with my accepted message**, forget one correction, or forget all. Words are derived from records; forgetting one example does not remove a word also present in another retained example. Forgetting a vocabulary word persists a normalized exclusion across restarts. It removes every spelling/case variant from usable vocabulary and excludes every saved example containing that word, including examples where the word was unchanged. Other learned words from those records remain usable. Original correction records remain available for review, with excluded examples labeled; this action suppresses personalization rather than erasing source history. Forget a correction or all corrections to delete those records. A newly committed correction explicitly changing a word can teach it again; replaying an existing receipt cannot. Ordinary edits to other words do not restore it. Forget all also clears exclusions. There are no persistent summaries or vector indexes.

Every memory mutation cancels active generation and emits a renderer invalidation, incrementing composition revision to reject already-staged results. It does not erase the draft, session conversation, or the separately implemented committed-sentence cache; those have their own controls.

## Validation

Automated coverage exercises committed versus tentative corrections, undo, exact spelling, prefix/context ranking over frequency, one-correction generalization to a new abbreviation, bounded retrieval, opt-in policies, restart persistence, editing/deletion, individual-word exclusions across restart, grouped vocabulary counts, filtering/pagination, and stale-result rejection. These checks do not establish live Gemini accuracy or gaze usability.

Preference facts and committed sentences have a separate [preference-memory flow](preference-memory.md). Every locked sentence is saved before speech, whether or not correction learning is enabled; only reviewed preference facts participate in semantic retrieval.
