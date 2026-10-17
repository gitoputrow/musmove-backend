import 'dart:convert';
import 'dart:io';

// Read-only import from the sibling mobile repo; no Flutter package required.
import '../../../musmove/lib/features/nutrition/domain/nutrition_estimate.dart';

void main() {
  final fixtures = jsonDecode(File('tests/fixtures/nutrition-v1.json').readAsStringSync()) as Map<String, dynamic>;
  var count = 0;
  for (final fixture in fixtures['cases'] as List<dynamic>) {
    final input = fixture['input'] as Map<String, dynamic>;
    final result = estimateNutrition(
      input['ageYears'] as int,
      NutritionProfile.fromJson({
        'weightKg': input['weightKg'],
        'heightCm': input['heightCm'],
        'sex': input['formulaSex'],
        'activity': input['dailyActivity'],
      }),
    );
    final actual = {
      'status': result.status.name,
      'restingKcal': result.restingKcal,
      'calories': result.calories,
      'proteinGrams': result.proteinGrams,
      'proteinMin': result.proteinMin,
      'proteinMax': result.proteinMax,
    };
    final expected = fixture['expected'] as Map<String, dynamic>;
    if (!expected.entries.every((entry) => actual[entry.key] == entry.value)) {
      throw StateError('Dart parity failed for ${fixture['name']}: $actual != $expected');
    }
    count++;
  }
  stdout.writeln('Dart/mobile nutrition parity passed: $count shared fixtures');
}
