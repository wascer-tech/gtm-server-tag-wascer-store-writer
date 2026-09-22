# Wascer Store Writer

A Google Tag Manager **server** tag that writes data into the Wascer Store, the
key-value store that lives inside your own server container. Use it to keep
event data, identifiers or any custom value that later events need to read
back with [Wascer Store Read](https://github.com/wascer-tech/gtm-server-variable-wascer-store-reader).

Built by [Wascer](https://wascer.com) for the server containers we host, and free
for anyone to use.

## What the template does

1. Writes one document per call into the Wascer Store.
2. Optionally saves the whole incoming event data in one go.
3. Lets you pick the document id and the collection, or falls back to the defaults.
4. Saves an arbitrary list of key/value pairs through the **Fields to Save** table.
5. Lets you choose whether a write merges into the existing document or replaces it.

## Installation

1. In your **server** container, open **Templates**, then **Tag Templates**,
   then **New**.
2. Open the three dot menu and choose **Import**.
3. Pick `template.tpl` from this repository and save.
4. Create a tag from the template, fill in the fields below, and attach a trigger.

## Fields

| Field | Type | What it does |
|---|---|---|
| Add event data | Checkbox | Saves the entire incoming event data into the document. |
| Document ID | Text (optional) | Id of the document to write. Leave empty to let the store generate one. |
| Collection | Text (optional) | Collection the document belongs to. Falls back to the default collection. |
| Fields to Save | Table | Key/value pairs written into the document, on top of the event data. |
| Write Mode | Select | How the write is applied. `Merge (default)` or `Replace all values`. See below. |

## Write modes

By default a write **merges** into the document that is already there: the fields
you send are updated, and every field you do not send is kept. That is the
historical behaviour, and it is what you get when you leave **Write Mode** alone.

The downside is that a field can never be removed. Once written, it stays in the
document for good, even after you take it out of the tag.

Set **Write Mode** to `Replace all values` when you want the opposite: the fields
you send become the whole document, and anything not sent is **deleted**. Nested
objects are replaced whole rather than merged field by field.

| | `Merge (default)` | `Replace all values` |
|---|---|---|
| Document before | `{"a": 1, "b": 2}` | `{"a": 1, "b": 2}` |
| Tag sends | `{"a": 9}` | `{"a": 9}` |
| Document after | `{"a": 9, "b": 2}` | `{"a": 9}` |

Under the hood the tag sends the chosen mode in the `x-wascer-write-mode`
request header. A server that does not know the header falls back to merging, so
the tag stays compatible with older container images.

## Requirements

A Google Tag Manager **server** container.
Templates published by Wascer are tested against the container images we host.

## Support

Open an issue in this repository, or reach the team at
[wascer.com](https://wascer.com). If you host your server container with Wascer,
support is included in your plan.

## License

Apache License 2.0. See [LICENSE](LICENSE).
