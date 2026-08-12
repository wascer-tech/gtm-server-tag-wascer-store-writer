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

## Requirements

A Google Tag Manager **server** container.
Templates published by Wascer are tested against the container images we host.

## Support

Open an issue in this repository, or reach the team at
[wascer.com](https://wascer.com). If you host your server container with Wascer,
support is included in your plan.

## License

Apache License 2.0. See [LICENSE](LICENSE).
