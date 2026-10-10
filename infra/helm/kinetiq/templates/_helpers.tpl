{{- define "kinetiq.labels" -}}
app.kubernetes.io/name: kinetiq
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: kinetiq-{{ .Chart.Version }}
{{- end -}}
{{- define "kinetiq.validate" -}}
{{- $secretNames := list -}}
{{- range $area, $name := .Values.secrets -}}
{{- if has $name $secretNames }}{{ fail "Secret references must be distinct for each identity" }}{{ end -}}
{{- $secretNames = append $secretNames $name -}}
{{- end -}}
{{- $memory := 0 -}}
{{- range $name, $component := .Values.components -}}
{{- $surge := 1 -}}
{{- if has $name (list "simulator" "local-bridge") }}{{ $surge = 0 }}{{ end -}}
{{- $replicas := $component.replicas -}}
{{- /* Reserve the bounded KEDA maximum, even when only one ingest Pod runs. */ -}}
{{- if eq $name "ingest" }}{{ $replicas = 3 }}{{ end -}}
{{- $memory = add $memory (mul (int (trimSuffix "Mi" $component.resources.limits.memory)) (add $replicas $surge)) -}}
{{- end -}}
{{- if .Values.jobs.enabled -}}
{{- $memory = add $memory (mul 2 (int (trimSuffix "Mi" .Values.jobs.resources.limits.memory))) -}}
{{- end -}}
{{- if gt $memory (int .Values.budgetMi) -}}
{{- fail (printf "Application memory budget exceeded: %d MiB > %d MiB, including surges and setup Jobs" $memory (int .Values.budgetMi)) -}}
{{- end -}}
{{- end -}}
{{- define "kinetiq.security" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: [ALL]
{{- end -}}
