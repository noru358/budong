import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";

const rubyAvailable=spawnSync("ruby",["-v"],{encoding:"utf8"}).status===0;
const parser=String.raw`
tree=Psych.parse(STDIN.read)
walk=lambda do |node|
  if node.is_a?(Psych::Nodes::Mapping)
    keys=node.children.each_slice(2).map {|k,v| k.value}
    raise "Duplicate YAML mapping key" if keys.uniq.size != keys.size
  end
  (node.children || []).each {|child| walk.call(child)}
end
walk.call(tree)
value=lambda {|mapping,key| mapping.children.each_slice(2).find {|k,v| k.value == key}&.last}
root=tree.root
inputs=value.call(value.call(value.call(root,"on"),"workflow_dispatch"),"inputs")
job=value.call(value.call(root,"jobs"),"smoke")
matrix=value.call(value.call(job,"strategy"),"matrix")
steps=value.call(job,"steps").children
step=steps.find {|s| value.call(s,"name")&.value == "Smoke RTMS and Building HUB"}
puts JSON.generate({input_count:inputs.children.size/2,
  service_types:value.call(matrix,"service_type").children.map(&:value),
  shell:value.call(step,"shell").value,run:value.call(step,"run").value})
`;
const workflow=fs.readFileSync(new URL("../.github/workflows/live-data-smoke.yml",import.meta.url),"utf8");
const parse=text=>spawnSync("ruby",["-rpsych","-rjson","-e",parser],{input:text,encoding:"utf8"});

test("live workflow parses YAML without duplicates and keeps dispatch limits, matrix and pipe failures",{skip:!rubyAvailable},()=>{
  const result=parse(workflow);
  assert.equal(result.status,0,result.stderr);
  const config=JSON.parse(result.stdout);
  assert.ok(config.input_count<=10);assert.deepEqual(config.service_types,["RH","APT","SH"]);
  assert.equal(config.shell,"bash");assert.equal(config.run.match(/set -o pipefail/g)?.length,1);
  // Regression: Psych's generic loader can silently overwrite duplicate keys.
  const duplicate=parse(workflow.replace("        shell: bash","        shell: bash\n        shell: bash"));
  assert.notEqual(duplicate.status,0);assert.match(duplicate.stderr,/Duplicate YAML mapping key/);
});
