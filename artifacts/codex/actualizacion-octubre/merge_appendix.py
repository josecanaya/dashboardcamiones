import copy
import json
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

directory = Path(__file__).resolve().parent
source = next(directory.parent.glob('*líquidos final.pptx'))
appendix = directory / 'build' / 'appendix.pptx'
destination = directory / 'build' / 'combined-candidate.pptx'
presentation_ns = 'http://schemas.openxmlformats.org/presentationml/2006/main'
relationship_ns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
package_ns = 'http://schemas.openxmlformats.org/package/2006/relationships'
content_ns = 'http://schemas.openxmlformats.org/package/2006/content-types'
ET.register_namespace('p', presentation_ns)
ET.register_namespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
ET.register_namespace('r', relationship_ns)

def xml_bytes(element):
    return ET.tostring(element, encoding='utf-8', xml_declaration=True)

with zipfile.ZipFile(source) as original, zipfile.ZipFile(appendix) as additions:
    files = {name: original.read(name) for name in original.namelist()}
    presentation = ET.fromstring(files['ppt/presentation.xml'])
    relationships = ET.fromstring(files['ppt/_rels/presentation.xml.rels'])
    types = ET.fromstring(files['[Content_Types].xml'])
    new_presentation = ET.fromstring(additions.read('ppt/presentation.xml'))
    new_relationships = ET.fromstring(additions.read('ppt/_rels/presentation.xml.rels'))
    new_types = ET.fromstring(additions.read('[Content_Types].xml'))
    part_map = {}
    for name in additions.namelist():
        if not name.startswith('ppt/') or name.endswith('.rels'):
            continue
        match = re.fullmatch(r'(.*/)([^/]*?)(\d+)(\.[^/.]+)', name)
        if match:
            folder, prefix, number, extension = match.groups()
            expression = re.compile(re.escape(folder + prefix) + r'(\d+)' + re.escape(extension))
            maximum = max((int(found.group(1)) for existing in files if (found := expression.fullmatch(existing))), default=0)
            part_map[name] = f'{folder}{prefix}{maximum + int(number)}{extension}'
        else:
            part_map[name] = posixpath.join(posixpath.dirname(name), 'october_' + posixpath.basename(name))
    for name in additions.namelist():
        if not name.startswith('ppt/') or not name.endswith('.rels'):
            continue
        owner = posixpath.join(posixpath.dirname(posixpath.dirname(name)), posixpath.basename(name)[:-5])
        mapped_owner = part_map[owner]
        part_map[name] = posixpath.join(posixpath.dirname(mapped_owner), '_rels', posixpath.basename(mapped_owner) + '.rels')
    assert presentation.find(f'{{{presentation_ns}}}sldSz').attrib == new_presentation.find(f'{{{presentation_ns}}}sldSz').attrib
    original_slides = presentation.find(f'{{{presentation_ns}}}sldIdLst')
    original_count = len(original_slides)
    relation_map = {element.get('Id'): element for element in new_relationships}
    next_relation = max((int(match.group(1)) for element in relationships if (match := re.fullmatch(r'rId(\d+)', element.get('Id', '')))), default=0) + 1
    next_slide = max(int(element.get('id')) for element in original_slides) + 1
    for element in new_presentation.find(f'{{{presentation_ns}}}sldIdLst'):
        relation = relation_map[element.get(f'{{{relationship_ns}}}id')]
        target = posixpath.normpath(posixpath.join('ppt', relation.get('Target'))).lstrip('/')
        relative = posixpath.relpath(part_map[target], 'ppt')
        identifier = f'rId{next_relation}'
        next_relation += 1
        ET.SubElement(relationships, f'{{{package_ns}}}Relationship', {'Id': identifier, 'Type': relation.get('Type'), 'Target': relative})
        ET.SubElement(original_slides, f'{{{presentation_ns}}}sldId', {'id': str(next_slide), f'{{{relationship_ns}}}id': identifier})
        next_slide += 1
    master_list = presentation.find(f'{{{presentation_ns}}}sldMasterIdLst')
    next_master = max(int(element.get('id')) for element in master_list) + 1
    for element in new_presentation.find(f'{{{presentation_ns}}}sldMasterIdLst'):
        relation = relation_map[element.get(f'{{{relationship_ns}}}id')]
        target = posixpath.normpath(posixpath.join('ppt', relation.get('Target'))).lstrip('/')
        relative = posixpath.relpath(part_map[target], 'ppt')
        identifier = f'rId{next_relation}'
        next_relation += 1
        ET.SubElement(relationships, f'{{{package_ns}}}Relationship', {'Id': identifier, 'Type': relation.get('Type'), 'Target': relative})
        ET.SubElement(master_list, f'{{{presentation_ns}}}sldMasterId', {'id': str(next_master), f'{{{relationship_ns}}}id': identifier})
        next_master += 1
    known_types = {(element.tag, element.get('PartName') or element.get('Extension')) for element in types}
    for element in new_types:
        modified = copy.deepcopy(element)
        part = modified.get('PartName')
        if part:
            if not part.startswith('/ppt/'):
                continue
            modified.set('PartName', '/' + part_map[part.lstrip('/')])
        identity = (modified.tag, modified.get('PartName') or modified.get('Extension'))
        if identity not in known_types:
            types.append(modified)
            known_types.add(identity)
    for name in additions.namelist():
        if not name.startswith('ppt/'):
            continue
        content = additions.read(name)
        if name.endswith('.rels'):
            root = ET.fromstring(content)
            owner_folder = posixpath.dirname(posixpath.dirname(name))
            mapped_folder = posixpath.dirname(posixpath.dirname(part_map[name]))
            for element in root:
                if element.get('TargetMode') == 'External':
                    continue
                target = element.get('Target', '')
                resolved = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(owner_folder, target))
                element.set('Target', posixpath.relpath(part_map[resolved], mapped_folder))
            content = xml_bytes(root)
        files[part_map[name]] = content
    files['ppt/presentation.xml'] = xml_bytes(presentation)
    files['ppt/_rels/presentation.xml.rels'] = xml_bytes(relationships)
    ET.register_namespace('', content_ns)
    files['[Content_Types].xml'] = xml_bytes(types)
    if 'docProps/app.xml' in files:
        app = ET.fromstring(files['docProps/app.xml'])
        for element in app.iter():
            if element.tag.endswith('}Slides'):
                element.text = str(len(original_slides))
        files['docProps/app.xml'] = xml_bytes(app)
    unresolved = []
    for name, content in files.items():
        if not name.endswith('.rels'):
            continue
        parent = posixpath.dirname(posixpath.dirname(name))
        for element in ET.fromstring(content):
            if element.get('TargetMode') == 'External':
                continue
            target = element.get('Target', '')
            resolved = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(parent, target))
            if resolved not in files:
                unresolved.append([name, target, resolved])
    assert not unresolved, unresolved
    original_slide_files = [name for name in original.namelist() if name.startswith('ppt/slides/')]
    assert all(files[name] == original.read(name) for name in original_slide_files)
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as result:
        for name, content in files.items():
            result.writestr(name, content)
    receipt = {'source': str(source), 'candidate': str(destination), 'originalSlides': original_count, 'appendedSlides': len(original_slides) - original_count, 'totalSlides': len(original_slides), 'originalSlidePartsUnchanged': True, 'unresolvedRelationships': unresolved}
    (directory / 'build' / 'merge-verification.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=True))
